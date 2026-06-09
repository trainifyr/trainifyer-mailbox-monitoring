# WI-201 — Cohort CRUD Backend APIs

> **GitHub Issue**: #5
> **Phase**: 2 — Student & Batch Management (Slice 1)
> **Priority**: High
> **Dependencies**: WI-102, WI-104
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-101 through WI-104 completed Phase 1 (Skeleton Setup & Mock Session Context). The project now has:

- **WI-101**: Workspace folder structure, `.gitignore`, `.env.example`, base `package.json` files.
- **WI-102**: Express backend with Mock Session middleware (`x-mock-role`, `x-mock-user-id` headers), `GET /api/health`, `GET /api/health/db`.
- **WI-103**: React + Vite frontend with routing, Mock Identity Bar, and Axios interceptor that forwards mock headers.
- **WI-104**: PostgreSQL schema on Supabase with 9 base tables (`users`, `batches`, `student_batches`, `batch_settings`, `mail_messages`, `meetings`, `meeting_participants`, `meeting_consents`, `attendance_logs`), enums, FK relationships, `updated_at` triggers, and RLS disabled.

This work item builds the **Cohort CRUD Backend APIs** — the first business-logic routes in the project. You will create Express route handlers for student management (list, create, update) and batch management (list, create, update, student assignment). All mutations require the `ADMIN` role from the Mock Session context; read endpoints are accessible to both `ADMIN` and `STUDENT` roles.

> ⚠️ **Mock Context-First Rule**: Role checks use `req.mockUserRole` and `req.mockUserId` set by the Mock Session middleware from WI-102. Real JWT validation and Supabase Auth are deferred to Phase 8 (WI-802).
>
> ⚠️ **No Secret Commits Rule**: No hardcoded credentials, API keys, or tokens. All environment configuration stays in `backend/.env` (git-ignored).
>
> ⚠️ **No Auth User Creation**: `POST /api/users/students` inserts a row into `public.users` with a generated UUID. Do **not** call Supabase Auth's `signUp()` or `admin.createUser()`. The `supabase_user_id` column remains NULL.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-201
- `GOALS.md` — Sub-Goal 2 (Cohort Management)
- `DEPENDENCIES.md` — Approved version of `zod` (^3.23.0)
- `HANDOFF.md` — Engineering discipline and rules
- `ASSUMPTIONS.md` — Single-batch-per-student rule (§1), no self-registration
- `VALIDATION.md` — Scenario A (Admin Access & Student Registration Flow)
- `prompts/WI-102-prompt.md` — Mock Session middleware setup
- `prompts/WI-104-prompt.md` — Database schema (the tables, constraints, and defaults you will use)
- `backend/db/schema.sql` — DDL for all tables (read the `users`, `batches`, `student_batches`, `batch_settings` sections carefully)

---

## Scope of This Work Item

- Create a **role-check middleware** (`requireRole`) that returns `403 Forbidden` if `req.mockUserRole` does not match the required role.
- Create **student routes** in `backend/src/routes/students.js`:
  - `GET /api/users/students` — List all students (with optional batch filter)
  - `POST /api/users/students` — Create a student profile (Admin only)
  - `PATCH /api/users/students/:id` — Update a student's name/email (Admin only)
- Create **batch routes** in `backend/src/routes/batches.js`:
  - `GET /api/batches` — List all batches
  - `POST /api/batches` — Create a batch + its default `batch_settings` row (Admin only)
  - `PATCH /api/batches/:id` — Update batch name or status (Admin only)
  - `GET /api/batches/:id/students` — List students assigned to a batch
  - `POST /api/batches/:id/students` — Assign a student to a batch (Admin only, enforces single-batch constraint)
- Register both route groups in `backend/index.js`.
- Add the `zod` package to `backend/package.json` for request body validation.
- Use the `pg` connection pool (`backend/src/lib/pgPool.js`) for all database operations.

This is a **backend-only** work item. No frontend views, forms, or UI components. The frontend admin pages for students and batches are built in WI-202.

---

## Step-by-Step Instructions

### 1. Install `zod`

From `backend/`:

```bash
npm install zod
```

Use the version from `DEPENDENCIES.md` (`zod ^3.23.0`).

### 2. Create the route file structure

```
backend/src/
├── lib/
│   └── requireRole.js     # Middleware: checks req.mockUserRole
├── routes/
│   ├── students.js        # /api/users/students routes
│   └── batches.js         # /api/batches routes
```

### 3. Write `backend/src/lib/requireRole.js`

A middleware factory that rejects requests when the mock role does not match.

```js
// Middleware that rejects requests when req.mockUserRole does not match
// the required role. Used in Phase 1-7. In Phase 8 (WI-802) this will be
// replaced by real JWT role checks.

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.mockUserRole || !roles.includes(req.mockUserRole)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires one of the following roles: ${roles.join(', ')}`
      });
    }
    next();
  };
}

module.exports = requireRole;
```

### 4. Write `backend/src/routes/students.js`

This module exports an Express Router with three endpoints.

```js
const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');
const requireRole = require('../lib/requireRole');

const router = Router();

// --- Zod schemas ---

const createStudentSchema = z.object({
  email: z.string().email('Invalid email address'),
  fullName: z.string().min(1, 'Full name is required'),
  role: z.literal('STUDENT')
});

const updateStudentSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  fullName: z.string().min(1, 'Full name is required').optional()
}).refine((data) => data.email || data.fullName, {
  message: 'At least one field (email, fullName) must be provided'
});

// --- GET /api/users/students ---
// List all students. Optional ?batchId= filter to scope to a batch.

router.get('/', async (req, res, next) => {
  try {
    const { batchId } = req.query;

    let query, params;

    if (batchId) {
      query = `
        SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at,
               sb.batch_id, sb.assigned_at
        FROM public.users u
        LEFT JOIN public.student_batches sb ON sb.student_id = u.id
        WHERE u.role = 'STUDENT' AND sb.batch_id = $1
        ORDER BY u.full_name ASC
      `;
      params = [batchId];
    } else {
      query = `
        SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at,
               sb.batch_id, sb.assigned_at
        FROM public.users u
        LEFT JOIN public.student_batches sb ON sb.student_id = u.id
        WHERE u.role = 'STUDENT'
        ORDER BY u.full_name ASC
      `;
      params = [];
    }

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/users/students ---
// Create a student profile. Admin only.
// Generates a UUID for the student ID. No Supabase Auth user is created.

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = createStudentSchema.parse(req.body);

    const { rows } = await pool.query(
      `INSERT INTO public.users (email, full_name, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, role, created_at, updated_at`,
      [body.email, body.fullName, body.role]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // Unique violation (email already exists)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'A user with this email already exists' });
    }
    next(err);
  }
});

// --- PATCH /api/users/students/:id ---
// Update a student's name and/or email. Admin only.

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateStudentSchema.parse(req.body);

    const sets = [];
    const params = [];
    let idx = 1;

    if (body.email !== undefined) {
      sets.push(`email = $${idx++}`);
      params.push(body.email);
    }
    if (body.fullName !== undefined) {
      sets.push(`full_name = $${idx++}`);
      params.push(body.fullName);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.users SET ${sets.join(', ')} WHERE id = $${idx} AND role = 'STUDENT'
       RETURNING id, email, full_name, role, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Student not found' });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Conflict', message: 'A user with this email already exists' });
    }
    next(err);
  }
});

module.exports = router;
```

### 5. Write `backend/src/routes/batches.js`

This module exports an Express Router with five endpoints.

```js
const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');
const requireRole = require('../lib/requireRole');

const router = Router();

// --- Zod schemas ---

const createBatchSchema = z.object({
  name: z.string().min(1, 'Batch name is required')
});

const updateBatchSchema = z.object({
  name: z.string().min(1, 'Batch name is required').optional(),
  status: z.enum(['active', 'inactive']).optional()
}).refine((data) => data.name || data.status, {
  message: 'At least one field (name, status) must be provided'
});

const assignStudentSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID')
});

// --- GET /api/batches ---
// List all batches, ordered by creation date descending.

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id, b.name, b.status, b.created_at, b.updated_at,
              (SELECT COUNT(*) FROM public.student_batches sb WHERE sb.batch_id = b.id) AS student_count
       FROM public.batches b
       ORDER BY b.created_at DESC`
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/batches ---
// Create a batch and its default batch_settings row in a single transaction.
// Admin only.

router.post('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const body = createBatchSchema.parse(req.body);
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows: batchRows } = await client.query(
        `INSERT INTO public.batches (name) VALUES ($1) RETURNING id, name, status, created_at, updated_at`,
        [body.name]
      );

      const batch = batchRows[0];

      await client.query(
        `INSERT INTO public.batch_settings (batch_id) VALUES ($1)`,
        [batch.id]
      );

      await client.query('COMMIT');

      res.status(201).json({ data: batch });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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

// --- PATCH /api/batches/:id ---
// Update a batch's name and/or status. Admin only.

router.patch('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateBatchSchema.parse(req.body);

    const sets = [];
    const params = [];
    let idx = 1;

    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(body.name);
    }
    if (body.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(body.status);
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.batches SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, name, status, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    res.json({ data: rows[0] });
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

// --- GET /api/batches/:id/students ---
// List all students assigned to a given batch.

router.get('/:id/students', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify batch exists
    const { rows: batchCheck } = await pool.query(
      `SELECT id FROM public.batches WHERE id = $1`,
      [id]
    );
    if (batchCheck.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.created_at, u.updated_at,
              sb.assigned_at
       FROM public.users u
       JOIN public.student_batches sb ON sb.student_id = u.id
       WHERE sb.batch_id = $1 AND u.role = 'STUDENT'
       ORDER BY u.full_name ASC`,
      [id]
    );

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/batches/:id/students ---
// Assign a student to a batch. Admin only.
// Enforces the single-batch-per-student constraint.
// Returns 409 Conflict if the student is already assigned to any batch.

router.post('/:id/students', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = assignStudentSchema.parse(req.body);

    // Verify the student exists and has role STUDENT
    const { rows: studentRows } = await pool.query(
      `SELECT id, role FROM public.users WHERE id = $1`,
      [body.studentId]
    );
    if (studentRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Student not found' });
    }
    if (studentRows[0].role !== 'STUDENT') {
      return res.status(400).json({ error: 'Bad Request', message: 'User is not a student' });
    }

    // Verify the batch exists
    const { rows: batchRows } = await pool.query(
      `SELECT id FROM public.batches WHERE id = $1`,
      [id]
    );
    if (batchRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    const { rows } = await pool.query(
      `INSERT INTO public.student_batches (student_id, batch_id)
       VALUES ($1, $2)
       RETURNING id, student_id, batch_id, assigned_at`,
      [body.studentId, id]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }))
      });
    }
    // student_batches_single_batch unique violation
    if (err.code === '23505') {
      // Check if the student is already in this specific batch
      const { rows: existing } = await pool.query(
        `SELECT batch_id FROM public.student_batches WHERE student_id = $1`,
        [body.studentId]
      );
      if (existing.length > 0 && existing[0].batch_id === id) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Student is already assigned to this batch'
        });
      }
      return res.status(409).json({
        error: 'Conflict',
        message: 'Student is already assigned to another batch (single-batch-per-student rule)'
      });
    }
    next(err);
  }
});

module.exports = router;
```

### 6. Register routes in `backend/index.js`

Add the two route groups after the existing health check endpoints and before the 404 handler:

```js
// -- Cohort CRUD routes (WI-201) --
app.use('/api/users/students', require('./src/routes/students'));
app.use('/api/batches', require('./src/routes/batches'));
```

The full registration order should be:
1. `app.use(helmet())`, `app.use(cors())`, `app.use(express.json())`
2. `app.use(mockSession)`
3. `GET /api/health`
4. `GET /api/health/db`
5. `app.use('/api/users/students', ...)`
6. `app.use('/api/batches', ...)`
7. 404 handler
8. Global error handler

### 7. Update `backend/README.md`

Append a "Routes" section documenting the new endpoints:

```
## Routes

### Health
- `GET /api/health` — Basic health check with mock user context
- `GET /api/health/db` — Database connectivity check (lists public tables)

### Students (WI-201)
- `GET /api/users/students` — List all students (optional `?batchId=` filter)
- `POST /api/users/students` — Create a student (Admin only)
- `PATCH /api/users/students/:id` — Update a student (Admin only)

### Batches (WI-201)
- `GET /api/batches` — List all batches with student count
- `POST /api/batches` — Create a batch + default settings (Admin only)
- `PATCH /api/batches/:id` — Update batch name/status (Admin only)
- `GET /api/batches/:id/students` — List students in a batch
- `POST /api/batches/:id/students` — Assign a student to a batch (Admin only)
```

### 8. Verify the implementation

Start the backend:

```bash
cd backend
npm run dev
```

Test each endpoint with curl (or any HTTP client):

```bash
# 1. List students (empty initially)
curl http://localhost:5000/api/users/students

# 2. Create a student (requires admin mock role)
curl -X POST http://localhost:5000/api/users/students \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"email": "rahul@test.com", "fullName": "Rahul Sharma", "role": "STUDENT"}'

# 3. Create a student as non-admin (should get 403)
curl -X POST http://localhost:5000/api/users/students \
  -H "Content-Type: application/json" \
  -H "x-mock-role: STUDENT" \
  -d '{"email": "unauth@test.com", "fullName": "Unauthorized", "role": "STUDENT"}'

# 4. Create a batch
curl -X POST http://localhost:5000/api/batches \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -d '{"name": "Cohort-1"}'

# 5. Assign the student to the batch (replace IDs)
curl -X POST http://localhost:5000/api/batches/<BATCH_ID>/students \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -d '{"studentId": "<STUDENT_ID>"}'

# 6. Verify the assignment
curl http://localhost:5000/api/batches/<BATCH_ID>/students

# 7. Update batch status
curl -X PATCH http://localhost:5000/api/batches/<BATCH_ID> \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -d '{"status": "inactive"}'

# 8. Try double-assignment (should get 409)
curl -X POST http://localhost:5000/api/batches/<ANOTHER_BATCH_ID>/students \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -d '{"studentId": "<SAME_STUDENT_ID>"}'
```

---

## Expected Output (File Checklist)

- [ ] `backend/src/lib/requireRole.js` — Role-check middleware factory
- [ ] `backend/src/routes/students.js` — Student CRUD routes (GET list, POST create, PATCH update)
- [ ] `backend/src/routes/batches.js` — Batch CRUD + assignment routes (GET list, POST create, PATCH update, GET/:id/students, POST/:id/students)
- [ ] `backend/index.js` — Registers both route groups
- [ ] `backend/package.json` — Adds `zod` dependency
- [ ] `backend/README.md` — Appends Routes section documenting all new endpoints

---

## Acceptance Criteria

- `POST /api/users/students` with an Admin mock role (`x-mock-role: ADMIN`) returns `201 Created` with a student object containing a UUID `id`.
- `POST /api/users/students` with a Student or anonymous role returns `403 Forbidden`.
- `GET /api/users/students` returns a list of all student profiles (accessible without Admin role).
- `GET /api/users/students?batchId=<id>` returns only students assigned to that batch.
- `PATCH /api/users/students/:id` updates the student's name and/or email and returns the updated row.
- `PATCH /api/users/students/:id` with a non-existent ID returns `404 Not Found`.
- `POST /api/batches` creates both a row in `batches` and a corresponding row in `batch_settings` with default values.
- `PATCH /api/batches/:id` with `{ "status": "inactive" }` updates the batch status.
- `GET /api/batches/:id/students` returns the roster of students assigned to that batch.
- `POST /api/batches/:id/students` with a student who is already assigned to a different batch returns `409 Conflict`.
- `POST /api/batches/:id/students` with a student who is already assigned to this same batch returns `409 Conflict`.
- All invalid request bodies return `400 Bad Request` with structured `{ error, details }` from Zod validation.
- No Supabase Auth users are created — all student records exist only in the `public.users` table with `supabase_user_id = NULL`.
- All database queries use parameterized `$N` placeholders (no string interpolation).
- The `student_batches_single_batch` UNIQUE constraint is the enforcement mechanism for the one-batch-per-student rule, surfaced as a `409` to the client.

---

## Risk / Impact

- **No real auth**: Student profiles are not linked to any login. This is intentional — Supabase Auth integration is in Phase 8 (WI-801). The `supabase_user_id` is NULL.
- **Single-batch enforcement**: The `student_batches_single_batch` UNIQUE constraint is the database-level guard. The `POST /api/batches/:id/students` handler catches the `23505` violation and translates it to a user-friendly `409`. If the business rule ever changes to allow multi-batch, this is the only place to update.
- **Batch creation is transactional**: `POST /api/batches` creates both the batch and its default settings in a single `BEGIN/COMMIT` block. If the settings insert fails, the batch is rolled back — no orphan rows.
- **Zod as the validation layer**: All endpoints use Zod schemas defined at the top of each route file. This keeps validation explicit and testable. Error responses use a consistent `{ error, details }` shape for client-side consumption.
- **No data seeding**: The routes are ready for data entry. Seeding test data is done manually or in WI-202 (frontend admin forms).

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-201** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Add a note summarizing what was implemented.
- Increment the `Done` and `Completion %` columns in the Phase 2 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-201: Cohort CRUD Backend APIs
* **Work Item ID**: WI-201
* **Summary**: Created 8 Express route handlers for cohort management: student list (with optional batch filter), student create (Admin only, generates UUID), student update, batch list (with student count), batch create (with transactional batch_settings insert), batch update (name/status), batch student roster, and student-to-batch assignment (enforcing single-batch-per-student with 409 Conflict). Added requireRole middleware and Zod input validation.
* **Files Affected**:
  - [NEW] `backend/src/lib/requireRole.js`
  - [NEW] `backend/src/routes/students.js`
  - [NEW] `backend/src/routes/batches.js`
  - [MODIFIED] `backend/index.js` (registered /api/users/students and /api/batches route groups)
  - [MODIFIED] `backend/package.json` (added zod dependency)
  - [MODIFIED] `backend/README.md` (added Routes section)
* **Verification Done**:
  - [x] `POST /api/users/students` returns 201 for Admin, 403 for Student/anon
  - [x] `GET /api/users/students` returns student list (no auth gate)
  - [x] `GET /api/users/students?batchId=...` filters by batch
  - [x] `PATCH /api/users/students/:id` updates student name/email
  - [x] `POST /api/batches` creates batch + default batch_settings
  - [x] `PATCH /api/batches/:id` updates name and/or status
  - [x] `GET /api/batches/:id/students` returns assigned roster
  - [x] `POST /api/batches/:id/students` returns 201 for new assignment, 409 for duplicate
  - [x] Invalid request bodies return 400 with Zod validation errors
  - [x] All queries use parameterized inputs (no SQL injection)
  - [x] No Supabase Auth users created; supabase_user_id remains NULL
  - [x] No secrets committed; .env is git-ignored
* **Impact on Existing Functionality**: None. The existing health check endpoints and Mock Session middleware from WI-102 are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-202 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Use `pgPool.js` for all DB operations**, not the Supabase JS client. The `@supabase/supabase-js` client is available but is intended for PostgREST convenience in later work items. Raw SQL with parameterized queries keeps the data access pattern explicit and consistent.
- **Do not touch authentication**: No calls to Supabase Auth (`signUp`, `admin.createUser`, etc.). The `supabase_user_id` column stays `NULL`. Student "identity" is purely the UUID in `public.users.id`.
- **Do not enable RLS**: RLS remains off. Every handler in this WI uses the `pg` pool directly with the service role, which is fine because RLS is disabled. WI-804 will change this.
- **Do not add security beyond mock role checks**: The `requireRole` middleware uses `req.mockUserRole` from the Mock Session. Real JWT validation comes in Phase 8.
- **Parameterized queries only**: Every SQL query must use `$1`, `$2`, etc. placeholders. Never concatenate user input into SQL strings.
- **Error handling pattern**: All route handlers are wrapped in try/catch. Zod errors return `400` with `{ error, details }`. Unique constraint violations (`23505`) return `409` with a descriptive message. All other errors are passed to `next(err)` for the global error handler.
- **Transaction for batch creation**: `POST /api/batches` must `BEGIN`, insert the batch row, insert the `batch_settings` row (with defaults from the schema), then `COMMIT`. On any failure, `ROLLBACK`.
- **Default batch_settings**: When a batch is created, the `batch_settings` row gets all defaults from the schema: `mailbox_enabled = true`, `student_to_student_messaging = false`, `meeting_join_enabled = true`, `require_camera = false`, `require_microphone = true`, `require_screen_share = 'OPTIONAL'`. The `INSERT` statement in the route should omit all columns except `batch_id` to use the DB defaults.
- **Read endpoints are open**: `GET /api/users/students`, `GET /api/batches`, and `GET /api/batches/:id/students` do NOT use `requireRole`. They are accessible to any request, including anonymous (no mock role set). This matches the Phase 1 convention (the `/api/health` endpoint is also open). If a future requirement needs to restrict reads, it will be added in a later work item.
- **Consistent response shape**: All successful responses use `{ data: ... }`. All error responses use `{ error: "...", message: "...", details: [...] }`.
- **Student list returns full_name** (snake_case): The database column is `full_name`. The API response uses `full_name` (snake_case to match the DB). The Zod input schema uses `fullName` (camelCase) as the JSON field name from the client. This flexibility allows the frontend to use camelCase in request bodies while the API response matches the database schema. Frontend code (WI-202) will map as needed.
