# WI-401 — Internal Mailbox APIs & Permissions Check

> **GitHub Issue**: #9
> **Phase**: 4 — Internal Mailbox System (Slice 3)
> **Priority**: High
> **Dependencies**: WI-301
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-301 created the batch settings backend (`GET/PATCH /api/batches/:id/settings`) with feature toggles including `mailbox_enabled` and `student_to_student_messaging`. The `mail_messages` table has existed in the database since WI-104.

This work item builds the **internal mailbox API** — the core messaging system of the platform. You will create four endpoints that allow users to send, receive, and manage messages entirely within the database. The endpoints enforce batch-level permission checks: if an Admin has disabled mailbox access for a batch, students in that batch cannot send or view messages. If student-to-student messaging is disabled, students can only message Admin users.

> ⚠️ **Mock Context-First Rule**: The sender's identity is `req.mockUserId`. Both Admin and Student roles can use the mailbox. There is no real auth — all identity comes from the Mock Session middleware.
>
> ⚠️ **Settings-Based Permission Checks**: Before any send or read operation, the backend must look up the sender's batch via `student_batches` and check the corresponding `batch_settings` row. These checks are the core business logic of this work item.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-401
- `GOALS.md` — Sub-Goal 4 (Database-Backed Mailbox System)
- `ASSUMPTIONS.md` — §2 Communications & Mailbox Assumptions (no attachments, no real-time, flat messages)
- `prompts/WI-104-prompt.md` — The `mail_messages` table DDL (lines 165-179 in schema.sql)
- `prompts/WI-301-prompt.md` — The batch_settings fields (`mailbox_enabled`, `student_to_student_messaging`)
- `backend/db/schema.sql` — `mail_messages` table (lines 84-98), `student_batches` and `batch_settings` tables
- `backend/src/routes/batches.js` — Existing patterns for querying students and batches

---

## Scope of This Work Item

- Create **`GET /api/mail/inbox`** — List messages received by the current user, newest first.
- Create **`GET /api/mail/sent`** — List messages sent by the current user, newest first.
- Create **`POST /api/mail/send`** — Send a new message (with permission checks).
- Create **`PATCH /api/mail/:id/read`** — Mark a received message as read.
- Enforce **mailbox permission checks** against the sender's batch settings.
- Register the new route file in `backend/index.js`.

This is a **backend-only** work item. The mailbox UI (inbox list, compose form, reading pane) is built in WI-402.

---

## Step-by-Step Instructions

### 1. Create the route file

```
backend/src/routes/
├── students.js       (existing — WI-201)
├── batches.js        (existing — WI-201)
├── batchSettings.js  (existing — WI-301)
└── mail.js           (NEW — WI-401)
```

### 2. Write `backend/src/routes/mail.js`

This module exports an Express Router with four endpoints.

```js
const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');

const router = Router();

// --- Zod schemas ---

const sendMessageSchema = z.object({
  receiverId: z.string().uuid('receiverId must be a valid UUID'),
  subject: z.string().min(1, 'Subject is required').max(200, 'Subject too long'),
  body: z.string().min(1, 'Body is required').max(10000, 'Body too long')
});

const inboxQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

// --- Permission helper ---

// Checks batch-level mailbox permissions for a student.
// Throws a structured error object that should be returned as-is to the client.
async function checkMailboxPermissions(studentId) {
  // Find the student's batch via student_batches
  const { rows: sbRows } = await pool.query(
    `SELECT sb.batch_id
     FROM public.student_batches sb
     WHERE sb.student_id = $1
     LIMIT 1`,
    [studentId]
  );

  // If the student has no batch assignment, mailbox is inaccessible
  if (sbRows.length === 0) {
    const err = new Error('You are not assigned to any batch. Mailbox access requires a batch assignment.');
    err.statusCode = 403;
    err.code = 'MAILBOX_NO_BATCH';
    throw err;
  }

  const batchId = sbRows[0].batch_id;

  // Fetch batch settings
  const { rows: settingsRows } = await pool.query(
    `SELECT mailbox_enabled, student_to_student_messaging
     FROM public.batch_settings
     WHERE batch_id = $1`,
    [batchId]
  );

  // If no settings row exists, use defaults (both enabled)
  const settings = settingsRows[0] || { mailbox_enabled: true, student_to_student_messaging: false };

  if (!settings.mailbox_enabled) {
    const err = new Error('Mailbox access is disabled for your batch');
    err.statusCode = 403;
    err.code = 'MAILBOX_DISABLED';
    throw err;
  }

  return { batchId, settings };
}

// Checks whether a user ID belongs to a student or admin role.
async function getUserRole(userId) {
  const { rows } = await pool.query(
    `SELECT role FROM public.users WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) return null;
  return rows[0].role;
}

// --- GET /api/mail/inbox ---
// List messages received by the current user, newest first.
// Supports pagination via ?page=1&limit=50.
// Includes sender name and email for display.

router.get('/inbox', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const role = await getUserRole(userId);
    if (!role) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // For students, check mailbox permissions
    if (role === 'STUDENT') {
      try {
        await checkMailboxPermissions(userId);
      } catch (permErr) {
        return res.status(permErr.statusCode || 403).json({
          error: 'Forbidden',
          message: permErr.message,
          code: permErr.code
        });
      }
    }

    const query = inboxQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    // Get total count for pagination info
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.mail_messages
       WHERE receiver_id = $1`,
      [userId]
    );
    const total = countRows[0].total;

    // Fetch paginated results with sender info
    const { rows } = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id,
              m.subject, m.body, m.is_read, m.read_at, m.created_at,
              sender.email AS sender_email,
              sender.full_name AS sender_name,
              sender.role AS sender_role
       FROM public.mail_messages m
       JOIN public.users sender ON sender.id = m.sender_id
       WHERE m.receiver_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, query.limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    next(err);
  }
});

// --- GET /api/mail/sent ---
// List messages sent by the current user, newest first.
// Supports pagination via ?page=1&limit=50.
// Includes receiver name and email for display.

router.get('/sent', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const role = await getUserRole(userId);
    if (!role) {
      return res.status(404).json({ error: 'Not Found', message: 'User not found' });
    }

    // For students, check mailbox permissions (sending implies mailbox is enabled)
    if (role === 'STUDENT') {
      try {
        await checkMailboxPermissions(userId);
      } catch (permErr) {
        return res.status(permErr.statusCode || 403).json({
          error: 'Forbidden',
          message: permErr.message,
          code: permErr.code
        });
      }
    }

    const query = inboxQuerySchema.parse(req.query);
    const offset = (query.page - 1) * query.limit;

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.mail_messages
       WHERE sender_id = $1`,
      [userId]
    );
    const total = countRows[0].total;

    const { rows } = await pool.query(
      `SELECT m.id, m.sender_id, m.receiver_id,
              m.subject, m.body, m.is_read, m.read_at, m.created_at,
              receiver.email AS receiver_email,
              receiver.full_name AS receiver_name,
              receiver.role AS receiver_role
       FROM public.mail_messages m
       JOIN public.users receiver ON receiver.id = m.receiver_id
       WHERE m.sender_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, query.limit, offset]
    );

    res.json({
      data: rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit)
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    next(err);
  }
});

// --- POST /api/mail/send ---
// Send a new message. Enforces permission checks:
//   - Sender must have a mock user ID (authenticated).
//   - If sender is a STUDENT:
//     - Their batch must have mailbox_enabled = true.
//     - If student_to_student_messaging = false, receiver must be an ADMIN.
//   - ADMIN can send to anyone regardless of settings.
//   - Self-messaging is prevented by the DB CHECK constraint (mail_messages_no_self_mail).

router.post('/send', async (req, res, next) => {
  try {
    const senderId = req.mockUserId;
    if (!senderId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const body = sendMessageSchema.parse(req.body);

    // Verify sender exists
    const senderRole = await getUserRole(senderId);
    if (!senderRole) {
      return res.status(404).json({ error: 'Not Found', message: 'Sender not found' });
    }

    // Verify receiver exists
    const receiverRole = await getUserRole(body.receiverId);
    if (!receiverRole) {
      return res.status(404).json({ error: 'Not Found', message: 'Receiver not found' });
    }

    // Prevent self-messaging (also enforced by DB CHECK constraint)
    if (senderId === body.receiverId) {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot send a message to yourself' });
    }

    // Permission checks for STUDENT senders
    if (senderRole === 'STUDENT') {
      try {
        const { settings } = await checkMailboxPermissions(senderId);

        // If student-to-student messaging is off, receiver must be an ADMIN
        if (!settings.student_to_student_messaging && receiverRole !== 'ADMIN') {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Student-to-student messaging is disabled for your batch. You can only message administrators.',
            code: 'STS_DISABLED'
          });
        }
      } catch (permErr) {
        return res.status(permErr.statusCode || 403).json({
          error: 'Forbidden',
          message: permErr.message,
          code: permErr.code
        });
      }
    }

    // Insert the message
    const { rows } = await pool.query(
      `INSERT INTO public.mail_messages (sender_id, receiver_id, subject, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, sender_id, receiver_id, subject, body, is_read, read_at, created_at`,
      [senderId, body.receiverId, body.subject, body.body]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // Foreign key violation — receiver does not exist
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Not Found', message: 'Sender or receiver not found' });
    }
    // Constraint violation — self-message (backup check)
    if (err.code === '23514' && err.constraint === 'mail_messages_no_self_mail') {
      return res.status(400).json({ error: 'Bad Request', message: 'Cannot send a message to yourself' });
    }
    next(err);
  }
});

// --- PATCH /api/mail/:id/read ---
// Mark a received message as read. Only the receiver can mark their own messages.

router.patch('/:id/read', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const { id } = req.params;

    // Verify the message exists and belongs to this user as receiver
    const { rows: existing } = await pool.query(
      `SELECT id, receiver_id, is_read
       FROM public.mail_messages
       WHERE id = $1`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Message not found' });
    }

    if (existing[0].receiver_id !== userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only mark your own messages as read'
      });
    }

    if (existing[0].is_read) {
      // Already read — return as-is (idempotent)
      const { rows } = await pool.query(
        `SELECT id, sender_id, receiver_id, subject, body, is_read, read_at, created_at
         FROM public.mail_messages WHERE id = $1`,
        [id]
      );
      return res.json({ data: rows[0] });
    }

    const { rows } = await pool.query(
      `UPDATE public.mail_messages
       SET is_read = true, read_at = now()
       WHERE id = $1 AND receiver_id = $2
       RETURNING id, sender_id, receiver_id, subject, body, is_read, read_at, created_at`,
      [id, userId]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### 3. Register the mail routes in `backend/index.js`

Add the import and mount after the batch settings route:

```js
// -- Cohort CRUD routes (WI-201) --
app.use('/api/users/students', require('./src/routes/students'));
app.use('/api/batches',        require('./src/routes/batches'));

// -- Batch settings routes (WI-301) --
app.use('/api/batches/:id/settings', require('./src/routes/batchSettings'));

// -- Mailbox routes (WI-401) --
app.use('/api/mail', require('./src/routes/mail'));
```

The full mounting order after changes:

```js
app.use('/api/users/students', require('./src/routes/students'));
app.use('/api/batches',        require('./src/routes/batches'));
app.use('/api/batches/:id/settings', require('./src/routes/batchSettings'));
app.use('/api/mail',           require('./src/routes/mail'));
```

### 4. Update `backend/README.md`

Append the WI-401 endpoint documentation to the Routes section:

```
### Mailbox (WI-401)
- `GET /api/mail/inbox` — List received messages (paginated)
- `GET /api/mail/sent` — List sent messages (paginated)
- `POST /api/mail/send` — Send a message (permission-checked)
- `PATCH /api/mail/:id/read` — Mark a message as read
```

### 5. Seed test data for manual verification

Run these SQL statements in the Supabase SQL Editor (or via `psql`) to create test users and seed messages:

```sql
-- Create an admin user (if not already present)
INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@test.com', 'Admin User', 'ADMIN')
ON CONFLICT (id) DO NOTHING;

-- Create a student (if not already present)
INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'rahul@test.com', 'Rahul Sharma', 'STUDENT')
ON CONFLICT (id) DO NOTHING;

-- Create a batch (if not already present)
INSERT INTO public.batches (id, name)
VALUES ('00000000-0000-0000-0000-000000000010', 'Cohort-1')
ON CONFLICT (id) DO NOTHING;

-- Assign the student to the batch
INSERT INTO public.student_batches (student_id, batch_id)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010')
ON CONFLICT (student_id) DO NOTHING;

-- Ensure batch_settings exist (defaults are fine)
INSERT INTO public.batch_settings (batch_id)
VALUES ('00000000-0000-0000-0000-000000000010')
ON CONFLICT (batch_id) DO NOTHING;
```

### 6. Verify the implementation

Start the backend:

```bash
cd backend
npm run dev
```

Test each endpoint:

```bash
# 1. Student sends a message to Admin
curl -X POST http://localhost:5000/api/mail/send \
  -H "Content-Type: application/json" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002" \
  -d '{"receiverId": "00000000-0000-0000-0000-000000000001", "subject": "Hello Admin", "body": "I have a question about the assignment."}'
# Expected: 201

# 2. Admin checks inbox
curl http://localhost:5000/api/mail/inbox \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 200 with 1 message from Rahul

# 3. Admin marks message as read
curl -X PATCH http://localhost:5000/api/mail/<MESSAGE_ID>/read \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 200 with is_read: true

# 4. Admin checks sent messages
curl http://localhost:5000/api/mail/sent \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 200 with 1 sent message

# 5. Disable student-to-student messaging, then try student-to-student
curl -X PATCH http://localhost:5000/api/batches/00000000-0000-0000-0000-000000000010/settings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"student_to_student_messaging": false}'

# Create a second student
INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000003', 'priya@test.com', 'Priya Patel', 'STUDENT')
ON CONFLICT (id) DO NOTHING;

# Now try student-to-student send (should fail)
curl -X POST http://localhost:5000/api/mail/send \
  -H "Content-Type: application/json" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002" \
  -d '{"receiverId": "00000000-0000-0000-0000-000000000003", "subject": "Hey Priya", "body": "How are you?"}'
# Expected: 403 Forbidden (sts_disabled)

# 6. Disable mailbox entirely
curl -X PATCH http://localhost:5000/api/batches/00000000-0000-0000-0000-000000000010/settings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"mailbox_enabled": false}'

# Try to send as student (should fail)
curl -X POST http://localhost:5000/api/mail/send \
  -H "Content-Type: application/json" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002" \
  -d '{"receiverId": "00000000-0000-0000-0000-000000000001", "subject": "Hello", "body": "Can you see this?"}'
# Expected: 403 Forbidden (mailbox_disabled)

# 7. Admin can always send regardless of settings
curl -X POST http://localhost:5000/api/mail/send \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"receiverId": "00000000-0000-0000-0000-000000000002", "subject": "Reply", "body": "Here is your answer."}'
# Expected: 201 (Admin bypasses all student permission checks)

# 8. Try marking someone else's message as read
# Get a message ID that belongs to Rahul, then try as Admin
curl -X PATCH http://localhost:5000/api/mail/<RAHUL_MESSAGE_ID>/read \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# If the message's receiver is rahul, this should return 403
```

---

## Expected Output (File Checklist)

- [ ] `backend/src/routes/mail.js` — 4 mailbox endpoints with permission checks
- [ ] `backend/index.js` — Registers `/api/mail` route group
- [ ] `backend/README.md` — Documents new mailbox endpoints

---

## Acceptance Criteria

- `POST /api/mail/send` creates a message row and returns `201` with the message object.
- `POST /api/mail/send` returns `403` with code `MAILBOX_DISABLED` when the sender (STUDENT) belongs to a batch with `mailbox_enabled = false`.
- `POST /api/mail/send` returns `403` with code `STS_DISABLED` when the sender (STUDENT) belongs to a batch with `student_to_student_messaging = false` and the receiver is not an ADMIN.
- `POST /api/mail/send` returns `401` when no `x-mock-user-id` header is provided.
- `POST /api/mail/send` returns `400` for empty subject, empty body, or invalid UUID.
- `POST /api/mail/send` returns `400` when sender === receiver.
- `POST /api/mail/send` allows ADMIN to send to any user regardless of batch settings.
- `GET /api/mail/inbox` returns messages where `receiver_id` matches the current user, ordered by `created_at DESC`, with sender name/email.
- `GET /api/mail/inbox` returns pagination metadata (`page`, `limit`, `total`, `totalPages`).
- `GET /api/mail/sent` returns messages where `sender_id` matches the current user, ordered by `created_at DESC`, with receiver name/email.
- `GET /api/mail/inbox` and `GET /api/mail/sent` return `403 MAILBOX_DISABLED` for STUDENT whose batch has mailbox disabled.
- `PATCH /api/mail/:id/read` sets `is_read = true` and `read_at = now()`, returns the updated message.
- `PATCH /api/mail/:id/read` is idempotent — calling it twice on an already-read message returns the same data.
- `PATCH /api/mail/:id/read` returns `403` if the caller is not the message receiver.
- `PATCH /api/mail/:id/read` returns `404` if the message ID does not exist.
- All queries use parameterized `$N` placeholders.
- `npm run dev` starts without errors.

---

## Permission Logic Summary

| Sender Role | Setting | Receiver | Result |
|-------------|---------|----------|--------|
| STUDENT | mailbox_enabled = false | Anyone | 403 MAILBOX_DISABLED |
| STUDENT | mailbox_enabled = true, sts = false | ADMIN | Allowed |
| STUDENT | mailbox_enabled = true, sts = false | STUDENT | 403 STS_DISABLED |
| STUDENT | mailbox_enabled = true, sts = true | Anyone | Allowed |
| ADMIN | Any | Anyone | Allowed (no permission checks) |
| No mock user | — | — | 401 Unauthorized |

---

## Risk / Impact

- **Mailbox permissions depend on batch assignment**: A student must be assigned to a batch via `student_batches` to use the mailbox. If they have no batch, they get a 403. This is intentional — unassigned students cannot use platform features until an Admin assigns them.
- **Admin bypasses all settings**: The permission checks only apply to STUDENT senders. ADMIN can always send, receive, and read messages. This matches the product goals where the Admin has full control.
- **No sender permission check on inbox/sent read**: The `GET /api/mail/inbox` and `GET /api/mail/sent` endpoints only check `mailbox_enabled` for STUDENT senders. They do not re-check `student_to_student_messaging` — that setting only applies when *sending* a message. Reading your own inbox/sent is always allowed as long as mailbox is enabled.
- **Pagination defaults**: Both inbox and sent endpoints default to `page=1` and `limit=50` with a max of 100. This prevents accidental full-table scans while keeping the API simple.
- **No DELETE endpoint**: Messages are never deleted in the MVP. If cleanup is needed later, it will be added as a separate work item.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-401** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 4 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-401: Internal Mailbox APIs & Permissions Check
* **Work Item ID**: WI-401
* **Summary**: Created 4 mailbox API endpoints (GET /api/mail/inbox, GET /api/mail/sent, POST /api/mail/send, PATCH /api/mail/:id/read) with batch-level permission enforcement. Students are blocked from sending if mailbox_enabled is false (403 MAILBOX_DISABLED) or if student_to_student_messaging is false and the receiver is not an ADMIN (403 STS_DISABLED). Admin bypasses all permission checks. Paginated inbox and sent views with sender/receiver details.
* **Files Affected**:
  - [NEW] `backend/src/routes/mail.js`
  - [MODIFIED] `backend/index.js` (registered /api/mail route group)
  - [MODIFIED] `backend/README.md` (added Mailbox endpoints)
* **Verification Done**:
  - [x] Student can send message to Admin (201)
  - [x] Student cannot send when mailbox_enabled = false (403)
  - [x] Student cannot send to another student when sts = false (403)
  - [x] Admin can send to anyone regardless of settings (201)
  - [x] Self-messaging returns 400
  - [x] GET /api/mail/inbox returns paginated received messages with sender info
  - [x] GET /api/mail/sent returns paginated sent messages with receiver info
  - [x] PATCH /api/mail/:id/read marks message as read (idempotent)
  - [x] Unauthorized (no mockUserId) returns 401
  - [x] All queries use parameterized inputs
  - [x] No secrets committed; .env is git-ignored
* **Impact on Existing Functionality**: None. Existing cohort, batch, and settings routes from WI-201, WI-202, WI-301, and WI-302 are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-402 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Permission checks are the core business logic**: The `checkMailboxPermissions` helper is the gatekeeper. It looks up the student's batch via `student_batches`, reads the batch settings, and throws a structured error if mailbox access is denied. All four endpoints must call this check (or at least the relevant subset) for STUDENT users.
- **Admin bypass**: ADMIN users are never subject to mailbox permission checks. The permission helper is only called when `senderRole === 'STUDENT'` or when the authenticated user is a STUDENT accessing inbox/sent.
- **No `requireRole` middleware needed**: Unlike WI-201 and WI-301, the mailbox endpoints do not use the `requireRole` middleware. Both ADMIN and STUDENT can use the mailbox. The only gating is:
  1. Must have `req.mockUserId` (401 if missing).
  2. The user must exist in `public.users` (404 if missing).
  3. Students are subject to batch settings permission checks.
- **Pagination pattern**: Both inbox and sent use the same pagination schema (`page`, `limit` with defaults). The response includes a `pagination` object alongside `data`. The total count is fetched with `COUNT(*)` in a separate query (acceptable for MVP data volumes).
- **Inbox/sent include user details**: The inbox query joins `public.users` as `sender` to return `sender_email`, `sender_name`, and `sender_role`. The sent query joins as `receiver` to return `receiver_email`, `receiver_name`, and `receiver_role`. This lets the frontend display sender/receiver names without extra API calls.
- **No attachments**: Per `ASSUMPTIONS.md` §2, messages are plain text with `subject` and `body` only. Do not add any file upload or attachment handling.
- **No real-time**: Per `ASSUMPTIONS.md` §2, there are no WebSockets or push notifications. The frontend (WI-402) will poll or let the user refresh manually.
- **Flat messages**: There is no threading, forwarding, or nesting. Each message is an independent row.
- **The `mail_messages_no_self_mail` CHECK constraint** in the database prevents same-user sends. The code also checks this explicitly and returns a 400 with a clear message, rather than letting the DB constraint surface as a generic error.
- **`read_at` is set to `now()`**: When `PATCH /api/mail/:id/read` marks a message as read, both `is_read = true` and `read_at = now()` are set. If the message is already read, the endpoint returns the existing data without modifying `read_at` (idempotent).
