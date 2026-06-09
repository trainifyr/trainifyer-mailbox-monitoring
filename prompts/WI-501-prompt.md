# WI-501 — Meeting Scheduler APIs

> **GitHub Issue**: #11
> **Phase**: 5 — Meetings & Privacy Consent (Slice 4)
> **Priority**: High
> **Dependencies**: WI-201
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-201 created the cohort CRUD backend (students, batches, batch-student assignments). The `meetings`, `meeting_participants`, and `meeting_consents` tables have existed in the database since WI-104.

This work item builds the **meeting scheduler API** — the backend for creating and discovering meetings. There are two meeting types:

- **Batch meetings** (internal) — Visible only to students assigned to the meeting's batch. The `batch_id` column references the target batch.
- **Public meetings** — Accessible by anyone, including anonymous external users. The `is_public` flag is `true` and `batch_id` is `NULL`.

> ⚠️ **Mock Context-First Rule**: Authenticated users (Admin and Student) use `req.mockUserId` for identity. Anonymous users (no mock role) can only access public meeting join. Admin role is required for creating meetings.
>
> ⚠️ **Batch Access Control**: Batch meetings returned via `GET /api/meetings` must be filtered to only include meetings whose `batch_id` matches the requesting student's assigned batch (via `student_batches`). Admin users see all meetings.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-501
- `GOALS.md` — Sub-Goal 5 (Meeting System Integration)
- `prompts/WI-104-prompt.md` — The `meetings` and `meeting_participants` table DDL
- `backend/db/schema.sql` — `meetings` table (lines 100-116), `meeting_participants` table (lines 118-130)
- `backend/src/routes/batches.js` — Existing patterns for batch existence checks and Student role queries

---

## Scope of This Work Item

- Create **`GET /api/meetings`** — List meetings visible to the current user.
  - Admin: sees all meetings.
  - Student: sees only batch meetings for their assigned batch + all public meetings.
  - Anonymous: sees only public meetings.
- Create **`POST /api/meetings`** — Create a new meeting (Admin only). Generates a unique Jitsi room name.
- Create **`POST /api/meetings/public/join`** — Register intent to join a public meeting. Requires either a mock user ID (authenticated users) or an external name (anonymous users). Creates a `meeting_participants` row and returns join credentials.
- Register the new route file in `backend/index.js`.

This is a **backend-only** work item. The meeting list UI, scheduling form, and Jitsi iframe integration are built in WI-502.

---

## Step-by-Step Instructions

### 1. Create the route file

```
backend/src/routes/
├── students.js       (existing — WI-201)
├── batches.js        (existing — WI-201)
├── batchSettings.js  (existing — WI-301)
├── mail.js           (existing — WI-401)
└── meetings.js       (NEW — WI-501)
```

### 2. Write `backend/src/routes/meetings.js`

```js
const { Router } = require('express');
const { z } = require('zod');
const crypto = require('crypto');
const pool = require('../lib/pgPool');
const requireRole = require('../lib/requireRole');

const router = Router();

// --- Zod schemas ---

const createMeetingSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  batchId: z.string().uuid('batchId must be a valid UUID').nullable().optional().default(null),
  isPublic: z.boolean().optional().default(false),
  scheduledStart: z.string().datetime({ offset: true }).nullable().optional().default(null),
  scheduledEnd: z.string().datetime({ offset: true }).nullable().optional().default(null)
}).refine(
  (data) => {
    // If isPublic is true, batchId must be null
    if (data.isPublic && data.batchId) {
      return false;
    }
    return true;
  },
  { message: 'Public meetings cannot have a batchId', path: ['batchId'] }
).refine(
  (data) => {
    // If isPublic is false (batch meeting), batchId is required
    if (!data.isPublic && !data.batchId) {
      return false;
    }
    return true;
  },
  { message: 'Batch meetings require a batchId', path: ['batchId'] }
);

const publicJoinSchema = z.object({
  externalName: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  meetingId: z.string().uuid('meetingId must be a valid UUID')
}).refine(
  (data) => {
    // At least one of the following must be true: caller has req.mockUserId, or externalName is provided
    // This is checked at runtime; here we just validate shape
    return true;
  }
);

// --- Helpers ---

// Generate a unique Jitsi room name: trainifyer-<6 random hex chars>-<slugified title>
function generateRoomName(title) {
  const random = crypto.randomBytes(3).toString('hex');
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30);
  return `trainifyer-${random}-${slug}`;
}

// Get the batch ID(s) a student is assigned to
async function getStudentBatchIds(studentId) {
  const { rows } = await pool.query(
    `SELECT batch_id FROM public.student_batches WHERE student_id = $1`,
    [studentId]
  );
  return rows.map((r) => r.batch_id);
}

// --- GET /api/meetings ---
// List meetings visible to the current user.
// Admin: all meetings. Student: batch meetings for their batch(es) + public meetings.
// Anonymous: only public meetings.

router.get('/', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    const role = req.mockUserRole;

    let rows;

    if (role === 'ADMIN') {
      // Admin sees all meetings
      const result = await pool.query(
        `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                creator.full_name AS created_by_name,
                b.name AS batch_name
         FROM public.meetings m
         LEFT JOIN public.users creator ON creator.id = m.created_by
         LEFT JOIN public.batches b ON b.id = m.batch_id
         ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`
      );
      rows = result.rows;
    } else if (role === 'STUDENT' && userId) {
      // Student sees batch meetings for their batch + public meetings
      const batchIds = await getStudentBatchIds(userId);

      if (batchIds.length === 0) {
        // Student not assigned to any batch — only see public meetings
        const result = await pool.query(
          `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                  m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                  creator.full_name AS created_by_name,
                  b.name AS batch_name
           FROM public.meetings m
           LEFT JOIN public.users creator ON creator.id = m.created_by
           LEFT JOIN public.batches b ON b.id = m.batch_id
           WHERE m.is_public = true
           ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`
        );
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                  m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                  creator.full_name AS created_by_name,
                  b.name AS batch_name
           FROM public.meetings m
           LEFT JOIN public.users creator ON creator.id = m.created_by
           LEFT JOIN public.batches b ON b.id = m.batch_id
           WHERE m.is_public = true OR m.batch_id = ANY($1::uuid[])
           ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`,
          [batchIds]
        );
        rows = result.rows;
      }
    } else {
      // Anonymous — only public meetings
      const result = await pool.query(
        `SELECT m.id, m.title, m.batch_id, m.jitsi_room_name, m.is_public,
                m.scheduled_start, m.scheduled_end, m.status, m.created_by, m.created_at, m.updated_at,
                creator.full_name AS created_by_name,
                b.name AS batch_name
         FROM public.meetings m
         LEFT JOIN public.users creator ON creator.id = m.created_by
         LEFT JOIN public.batches b ON b.id = m.batch_id
         WHERE m.is_public = true
         ORDER BY m.scheduled_start ASC NULLS LAST, m.created_at DESC`
      );
      rows = result.rows;
    }

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/meetings ---
// Create a new meeting. Admin only.
// Generates a unique Jitsi room name automatically.

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const creatorId = req.mockUserId;
    if (!creatorId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required' });
    }

    const body = createMeetingSchema.parse(req.body);

    // Verify the creator exists
    const { rows: creatorRows } = await pool.query(
      `SELECT id FROM public.users WHERE id = $1`,
      [creatorId]
    );
    if (creatorRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Creator user not found' });
    }

    // If batchId provided, verify the batch exists
    if (body.batchId) {
      const { rows: batchRows } = await pool.query(
        `SELECT id FROM public.batches WHERE id = $1`,
        [body.batchId]
      );
      if (batchRows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
      }
    }

    // Generate unique room name
    const roomName = generateRoomName(body.title);

    const { rows } = await pool.query(
      `INSERT INTO public.meetings (title, batch_id, jitsi_room_name, is_public, scheduled_start, scheduled_end, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, batch_id, jitsi_room_name, is_public, scheduled_start, scheduled_end, status, created_by, created_at, updated_at`,
      [
        body.title,
        body.batchId,
        roomName,
        body.isPublic,
        body.scheduledStart,
        body.scheduledEnd,
        creatorId
      ]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // Unique violation on jitsi_room_name (extremely unlikely with random suffix)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'A meeting with this room name already exists. Try again.' });
    }
    next(err);
  }
});

// --- POST /api/meetings/public/join ---
// Register intent to join a public meeting.
// - Authenticated users: identified by req.mockUserId, creates participant with user_id.
// - Anonymous users: must provide externalName, creates participant with external_name.
// Returns the meeting info + participant record.

router.post('/public/join', async (req, res, next) => {
  try {
    const userId = req.mockUserId;
    const body = publicJoinSchema.parse(req.body);

    // Determine identity: authenticated user OR external name
    let participantUserId = null;
    let participantExternalName = null;

    if (userId) {
      participantUserId = userId;

      // Verify user exists
      const { rows: userRows } = await pool.query(
        `SELECT id FROM public.users WHERE id = $1`,
        [userId]
      );
      if (userRows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'User not found' });
      }
    } else if (body.externalName) {
      participantExternalName = body.externalName;
    } else {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Provide a mock user ID (via headers) or an externalName in the request body'
      });
    }

    // Verify the meeting exists and is public
    const { rows: meetingRows } = await pool.query(
      `SELECT id, title, jitsi_room_name, is_public, status, batch_id
       FROM public.meetings WHERE id = $1`,
      [body.meetingId]
    );

    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    const meeting = meetingRows[0];

    if (!meeting.is_public) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'This endpoint is only for public meetings. Use the batch meeting join flow instead.'
      });
    }

    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      return res.status(410).json({
        error: 'Gone',
        message: `This meeting has been ${meeting.status.toLowerCase()} and cannot be joined`
      });
    }

    // Check if participant already registered (idempotent for authenticated users)
    if (participantUserId) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM public.meeting_participants
         WHERE meeting_id = $1 AND user_id = $2`,
        [body.meetingId, participantUserId]
      );
      if (existing.length > 0) {
        // Already registered — return existing
        const { rows: partRows } = await pool.query(
          `SELECT mp.id, mp.meeting_id, mp.user_id, mp.external_name, mp.created_at,
                  m.title, m.jitsi_room_name
           FROM public.meeting_participants mp
           JOIN public.meetings m ON m.id = mp.meeting_id
           WHERE mp.id = $1`,
          [existing[0].id]
        );
        return res.json({ data: partRows[0] });
      }
    }

    // Insert participant
    const { rows: participantRows } = await pool.query(
      `INSERT INTO public.meeting_participants (meeting_id, user_id, external_name)
       VALUES ($1, $2, $3)
       RETURNING id, meeting_id, user_id, external_name, created_at`,
      [body.meetingId, participantUserId, participantExternalName]
    );

    // Return combined response
    res.status(201).json({
      data: {
        ...participantRows[0],
        title: meeting.title,
        jitsi_room_name: meeting.jitsi_room_name
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

module.exports = router;
```

### 3. Register the meeting routes in `backend/index.js`

Add the import and mount after the mailbox route:

```js
// -- Mailbox routes (WI-401) --
app.use('/api/mail', require('./src/routes/mail'));

// -- Meeting routes (WI-501) --
app.use('/api/meetings', require('./src/routes/meetings'));
```

### 4. Update `backend/README.md`

Append the WI-501 endpoint documentation to the Routes section:

```
### Meetings (WI-501)
- `GET /api/meetings` — List visible meetings (scoped by role and batch)
- `POST /api/meetings` — Create a meeting with auto-generated Jitsi room name (Admin only)
- `POST /api/meetings/public/join` — Register to join a public meeting (authenticated or anonymous)
```

### 5. Seed test data for manual verification

```sql
-- Admin user (if not already present)
INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@test.com', 'Admin User', 'ADMIN')
ON CONFLICT (id) DO NOTHING;

-- Student user (if not already present)
INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'rahul@test.com', 'Rahul Sharma', 'STUDENT')
ON CONFLICT (id) DO NOTHING;

-- Batch (if not already present)
INSERT INTO public.batches (id, name)
VALUES ('00000000-0000-0000-0000-000000000010', 'Cohort-1')
ON CONFLICT (id) DO NOTHING;

-- Assign student to batch
INSERT INTO public.student_batches (student_id, batch_id)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010')
ON CONFLICT (student_id) DO NOTHING;
```

### 6. Verify the implementation

Start the backend:

```bash
cd backend
npm run dev
```

Test each endpoint:

```bash
# 1. Admin creates a batch meeting
curl -X POST http://localhost:5000/api/meetings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"title": "Math Lecture 1", "batchId": "00000000-0000-0000-0000-000000000010", "scheduledStart": "2026-06-10T09:00:00Z", "scheduledEnd": "2026-06-10T10:00:00Z"}'
# Expected: 201 with meeting object containing auto-generated jitsi_room_name

# 2. Admin creates a public meeting
curl -X POST http://localhost:5000/api/meetings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"title": "Guest Lecture", "isPublic": true, "scheduledStart": "2026-06-11T15:00:00Z"}'
# Expected: 201

# 3. Admin lists all meetings
curl http://localhost:5000/api/meetings \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 200 with both meetings

# 4. Student lists meetings (should see batch meeting + public meeting)
curl http://localhost:5000/api/meetings \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 200 with the batch meeting for Cohort-1 + the public meeting

# 5. Student from a different batch tries to list (should only see public)
# First create another student with no batch
INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000004', 'unassigned@test.com', 'Unassigned Student', 'STUDENT')
ON CONFLICT (id) DO NOTHING;

curl http://localhost:5000/api/meetings \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000004"
# Expected: 200 with only the public meeting

# 6. Anonymous lists public meetings
curl http://localhost:5000/api/meetings
# Expected: 200 with only public meetings

# 7. Anonymous joins a public meeting
curl -X POST http://localhost:5000/api/meetings/public/join \
  -H "Content-Type: application/json" \
  -d '{"meetingId": "<PUBLIC_MEETING_ID>", "externalName": "Guest User"}'
# Expected: 201 with participant record + meeting info

# 8. Student joins a public meeting
curl -X POST http://localhost:5000/api/meetings/public/join \
  -H "Content-Type: application/json" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002" \
  -d '{"meetingId": "<PUBLIC_MEETING_ID>"}'
# Expected: 201 (or 200 if already joined)

# 9. Try joining a batch meeting via public/join (should fail)
curl -X POST http://localhost:5000/api/meetings/public/join \
  -H "Content-Type: application/json" \
  -d '{"meetingId": "<BATCH_MEETING_ID>", "externalName": "Guest"}'
# Expected: 403 Forbidden (only public meetings via this endpoint)

# 10. Student tries to create a meeting (should fail)
curl -X POST http://localhost:5000/api/meetings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002" \
  -d '{"title": "My Meeting", "batchId": "00000000-0000-0000-0000-000000000010"}'
# Expected: 403 Forbidden
```

---

## Expected Output (File Checklist)

- [ ] `backend/src/routes/meetings.js` — GET /api/meetings, POST /api/meetings, POST /api/meetings/public/join
- [ ] `backend/index.js` — Registers /api/meetings route group
- [ ] `backend/README.md` — Documents new meeting endpoints

---

## Acceptance Criteria

- `POST /api/meetings` with Admin role creates a meeting with an auto-generated `jitsi_room_name` and returns `201`.
- `POST /api/meetings` with a Student role returns `403`.
- `POST /api/meetings` requires a `batchId` when `isPublic` is `false`, and rejects `batchId` when `isPublic` is `true` (Zod refinement).
- `POST /api/meetings` with a non-existent `batchId` returns `404`.
- `GET /api/meetings` as Admin returns all meetings (batch + public) with `created_by_name` and `batch_name`.
- `GET /api/meetings` as Student returns batch meetings for their assigned batch(es) plus all public meetings.
- `GET /api/meetings` as a Student with no batch assignment returns only public meetings.
- `GET /api/meetings` with no mock role (anonymous) returns only public meetings.
- `POST /api/meetings/public/join` with a valid public meeting ID and an `externalName` creates a participant row and returns `201`.
- `POST /api/meetings/public/join` with an authenticated user (`req.mockUserId`) creates a participant row linked to their user ID.
- `POST /api/meetings/public/join` on a batch (non-public) meeting returns `403`.
- `POST /api/meetings/public/join` on a cancelled or ended meeting returns `410`.
- `POST /api/meetings/public/join` is idempotent for authenticated users — calling it twice returns `200` with the existing participant record.
- All queries use parameterized `$N` placeholders.
- `npm run dev` starts without errors.

---

## Access Control Summary

| User | Can Create? | Can List? | Can Join Public? |
|------|------------|-----------|-----------------|
| ADMIN | Yes (any meeting type) | All meetings | Yes (via mockUserId) |
| STUDENT (assigned to batch) | No | Batch meetings for their batch + public meetings | Yes (via mockUserId) |
| STUDENT (unassigned) | No | Public meetings only | Yes (via mockUserId) |
| Anonymous | No | Public meetings only | Yes (via externalName) |

---

## Risk / Impact

- **Jitsi room name generation**: The room name is `trainifyer-<random>-<slugified-title>`. The random suffix (6 hex chars = 16M possibilities) prevents collisions and makes room names hard to guess. The `jitsi_room_name` column has a UNIQUE constraint as a safety net.
- **No end-to-end Jitsi integration**: The API generates room names but does not interact with the Jitsi Meet API. The actual iframe embedding is done on the frontend in WI-502. The room name must match the Jitsi room name used in the iframe URL.
- **Public meeting join is lightweight**: The `POST /api/meetings/public/join` endpoint simply creates a `meeting_participants` row. It does not generate JWT tokens, session keys, or any access credentials beyond the participant record. In Phase 8, this will need a security review.
- **Batch meeting access is list-level only**: The batch access control is enforced at the `GET /api/meetings` list level — students can only see meetings for their batch. There is no per-meeting authorization check on individual meeting detail (no `GET /api/meetings/:id` endpoint yet). If a detail endpoint is added later, it must also enforce the same batch filter.
- **No meeting status transitions**: The API does not include endpoints to transition meeting status (SCHEDULED → LIVE → ENDED → CANCELLED). Those are deferred to a later work item or handled manually via SQL for the MVP.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-501** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 5 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-501: Meeting Scheduler APIs
* **Work Item ID**: WI-501
* **Summary**: Created 3 meeting API endpoints: GET /api/meetings (role-scoped listing — Admin sees all, Student sees batch+public, anonymous sees public), POST /api/meetings (Admin-only create with auto-generated Jitsi room name), and POST /api/meetings/public/join (register authenticated or anonymous participants). Batch access control enforced at the list level.
* **Files Affected**:
  - [NEW] `backend/src/routes/meetings.js`
  - [MODIFIED] `backend/index.js` (registered /api/meetings route group)
  - [MODIFIED] `backend/README.md` (added Meeting endpoints)
* **Verification Done**:
  - [x] Admin can create batch and public meetings (201)
  - [x] Student cannot create meetings (403)
  - [x] Admin lists all meetings
  - [x] Student lists batch meetings (their batch) + public meetings
  - [x] Anonymous lists only public meetings
  - [x] Authenticated user can join public meeting (creates participant with user_id)
  - [x] Anonymous user can join public meeting with externalName
  - [x] Batch meeting cannot be joined via /public/join (403)
  - [x] Cancelled/ended meeting returns 410 on join
  - [x] Duplicate public join is idempotent (200 vs 201)
  - [x] All queries use parameterized inputs
  - [x] No secrets committed; .env is git-ignored
* **Impact on Existing Functionality**: None. Existing cohort, settings, and mailbox routes are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-502 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Role-scoped listing is the primary access control mechanism**: The `GET /api/meetings` endpoint uses three different queries based on the caller's role:
  1. **Admin**: No filter — all meetings.
  2. **Student with batch(es)**: `WHERE is_public = true OR batch_id = ANY($1)` where `$1` is the student's batch IDs from `student_batches`.
  3. **Anonymous or Student with no batch**: `WHERE is_public = true` only.
- **Jitsi room name format**: `trainifyer-<6-char-random-hex>-<slugified-title>`. The slugified title is lowercased, non-alphanumeric characters replaced with hyphens, truncated to 30 characters. Example: `trainifyer-a3f9c2-math-lecture-1`. This format is recognizable in Jitsi Meet's interface.
- **Meeting status defaults to SCHEDULED**: The `status` column defaults to `'SCHEDULED'` in the database schema. The `POST /api/meetings` endpoint does not set a status, so all new meetings start as SCHEDULED.
- **Public meeting validation**: The Zod schema ensures that:
  - If `isPublic` is `true`, `batchId` must be `null`.
  - If `isPublic` is `false`, `batchId` is required.
- **DateTime format**: The Zod schema uses `z.string().datetime({ offset: true })` which accepts ISO 8601 strings with timezone offsets (e.g., `"2026-06-10T09:00:00Z"` or `"2026-06-10T09:00:00+05:30"`). Both `scheduledStart` and `scheduledEnd` are nullable.
- **`created_by` is required**: The `meetings` table has `created_by` as NOT NULL. The controller sets it to `req.mockUserId` of the creating Admin. The controller verifies the creator exists in `public.users` before inserting.
- **Public join idempotency**: For authenticated users, if a `meeting_participants` row already exists for that `user_id` + `meeting_id`, the endpoint returns `200` with the existing record instead of creating a duplicate. This prevents duplicate participant entries on page refresh.
- **Do not modify the frontend**: This is a backend-only work item. Do not touch `frontend/` files.
- **No meeting settings check**: Unlike the mailbox (WI-401), the meeting listing does not check `batch_settings.meeting_join_enabled`. That check is deferred to WI-503 (privacy consent) or the frontend. The WI-501 endpoints only handle visibility and participant registration.
