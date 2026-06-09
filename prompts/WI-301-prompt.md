# WI-301 — Feature Settings Backend Logic

> **GitHub Issue**: #7
> **Phase**: 3 — Cohort Configuration Controls (Slice 2)
> **Priority**: High
> **Dependencies**: WI-201
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-201 created the cohort CRUD backend (`/api/users/students`, `/api/batches`), including automatic creation of a default `batch_settings` row whenever a batch is created. The `batch_settings` table already exists in the database (provisioned in WI-104) with all the toggle columns and their defaults.

This work item exposes those settings via two new endpoints so the frontend (WI-302) can read and update them. You will create a dedicated route file for batch settings and register it in the Express app.

> ⚠️ **Mock Context-First Rule**: Mutations require `req.mockUserRole === 'ADMIN'` via the existing `requireRole` middleware. Reads are open to any authenticated role (both Admin and Student can view settings).
>
> ⚠️ **RLS-Off Rule (TEMPORARY)**: RLS remains disabled. The `requireRole` middleware is the only access control. RLS policies come in Phase 8 (WI-804).

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-301
- `GOALS.md` — Sub-Goal 3 (Feature & Permission Configuration)
- `prompts/WI-104-prompt.md` — The `batch_settings` table definition (columns, types, defaults)
- `prompts/WI-201-prompt.md` — Existing batch routes (the settings route will live alongside them)
- `backend/db/schema.sql` — DDL for `batch_settings` (lines 70-82)
- `backend/src/routes/batches.js` — Existing batch route patterns to follow

---

## Scope of This Work Item

- Create **`GET /api/batches/:id/settings`** — Return the settings object for a batch.
- Create **`PATCH /api/batches/:id/settings`** — Update one or more settings fields (Admin only).
- Validate inputs with Zod: booleans for toggle fields, enum for `require_screen_share`.
- Register the new route file in `backend/index.js`.

This is a **backend-only** work item. No frontend UI. The settings toggle panel on the Batch Detail page is built in WI-302.

---

## Step-by-Step Instructions

### 1. Create the route file

```
backend/src/routes/
├── students.js       (existing — WI-201)
├── batches.js        (existing — WI-201)
└── batchSettings.js  (NEW — WI-301)
```

### 2. Write `backend/src/routes/batchSettings.js`

```js
const { Router } = require('express');
const { z } = require('zod');
const pool = require('../lib/pgPool');
const requireRole = require('../lib/requireRole');

const router = Router({ mergeParams: true });

// --- Zod schemas ---

const updateSettingsSchema = z.object({
  mailbox_enabled: z.boolean().optional(),
  student_to_student_messaging: z.boolean().optional(),
  meeting_join_enabled: z.boolean().optional(),
  require_camera: z.boolean().optional(),
  require_microphone: z.boolean().optional(),
  require_screen_share: z.enum(['REQUIRED', 'OPTIONAL', 'OFF']).optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one setting field must be provided' }
);

// --- GET /api/batches/:id/settings ---
// Returns the settings object for a batch. Open to all roles.

router.get('/', async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT id, batch_id,
              mailbox_enabled,
              student_to_student_messaging,
              meeting_join_enabled,
              require_camera,
              require_microphone,
              require_screen_share,
              created_at,
              updated_at
       FROM public.batch_settings
       WHERE batch_id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Settings not found for this batch'
      });
    }

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// --- PATCH /api/batches/:id/settings ---
// Update one or more settings fields. Admin only.

router.patch('/', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const body = updateSettingsSchema.parse(req.body);

    // Verify the batch exists (fail early with 404)
    const { rows: batchCheck } = await pool.query(
      `SELECT id FROM public.batches WHERE id = $1`,
      [id]
    );
    if (batchCheck.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Batch not found' });
    }

    // Check if a settings row exists; if not, insert defaults first
    const { rows: existing } = await pool.query(
      `SELECT id FROM public.batch_settings WHERE batch_id = $1`,
      [id]
    );
    if (existing.length === 0) {
      await pool.query(
        `INSERT INTO public.batch_settings (batch_id) VALUES ($1)`,
        [id]
      );
    }

    // Build dynamic SET clause from provided fields
    const allowedFields = [
      'mailbox_enabled',
      'student_to_student_messaging',
      'meeting_join_enabled',
      'require_camera',
      'require_microphone',
      'require_screen_share'
    ];

    const sets = [];
    const params = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = $${idx++}`);
        params.push(body[field]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'No fields to update' });
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE public.batch_settings SET ${sets.join(', ')} WHERE batch_id = $${idx}
       RETURNING id, batch_id,
                 mailbox_enabled,
                 student_to_student_messaging,
                 meeting_join_enabled,
                 require_camera,
                 require_microphone,
                 require_screen_share,
                 created_at,
                 updated_at`,
      params
    );

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

module.exports = router;
```

> **Why `mergeParams: true`?** The settings routes are nested under the batch param (`:id`). Setting `mergeParams: true` on the Router allows `req.params.id` to be inherited from the parent route that mounts it.

### 3. Register the settings route in `backend/index.js`

Add the import and mount after the existing batch route group:

```js
// -- Cohort CRUD routes (WI-201) --
app.use('/api/users/students', require('./src/routes/students'));
app.use('/api/batches',        require('./src/routes/batches'));

// -- Batch settings routes (WI-301) --
app.use('/api/batches/:id/settings', require('./src/routes/batchSettings'));
```

The full mounting order after changes:

```js
app.use('/api/users/students', require('./src/routes/students'));
app.use('/api/batches',        require('./src/routes/batches'));
app.use('/api/batches/:id/settings', require('./src/routes/batchSettings'));
```

### 4. Update `backend/README.md`

Append the WI-301 endpoint documentation to the Routes section:

```
### Batch Settings (WI-301)
- `GET /api/batches/:id/settings` — Get settings for a batch
- `PATCH /api/batches/:id/settings` — Update settings for a batch (Admin only)
```

### 5. Verify the implementation

Start the backend:

```bash
cd backend
npm run dev
```

Test each endpoint:

```bash
# 1. Get settings for a batch that was created by WI-201
#    (every batch should have a default settings row)
curl http://localhost:5000/api/batches/<BATCH_ID>/settings

# Expected: 200 with default settings:
# {
#   "data": {
#     "mailbox_enabled": true,
#     "student_to_student_messaging": false,
#     "meeting_join_enabled": true,
#     "require_camera": false,
#     "require_microphone": true,
#     "require_screen_share": "OPTIONAL",
#     ...
#   }
# }

# 2. Get settings for a non-existent batch
curl http://localhost:5000/api/batches/00000000-0000-0000-0000-000000000000/settings
# Expected: 404

# 3. Update settings (Admin only)
curl -X PATCH http://localhost:5000/api/batches/<BATCH_ID>/settings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -d '{
    "mailbox_enabled": false,
    "student_to_student_messaging": true,
    "require_screen_share": "REQUIRED"
  }'

# Expected: 200 with updated settings

# 4. Update settings without Admin role
curl -X PATCH http://localhost:5000/api/batches/<BATCH_ID>/settings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: STUDENT" \
  -d '{"mailbox_enabled": false}'
# Expected: 403

# 5. Update with invalid value (screen_share should be enum)
curl -X PATCH http://localhost:5000/api/batches/<BATCH_ID>/settings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -d '{"require_screen_share": "INVALID"}'
# Expected: 400 with Zod validation error

# 6. Re-read settings to confirm persistence
curl http://localhost:5000/api/batches/<BATCH_ID>/settings
# Expected: 200 with the updated values from step 3
```

---

## Expected Output (File Checklist)

- [ ] `backend/src/routes/batchSettings.js` — GET and PATCH handlers for `/api/batches/:id/settings`
- [ ] `backend/index.js` — Registers the settings route group
- [ ] `backend/README.md` — Documents the new settings endpoints

---

## Acceptance Criteria

- `GET /api/batches/:id/settings` returns `200` with the full settings object for an existing batch.
- `GET /api/batches/:id/settings` returns `404` if the batch does not exist.
- `GET /api/batches/:id/settings` does **not** require any mock role (open to Admin and Student).
- `PATCH /api/batches/:id/settings` accepts any subset of the 6 settings fields and returns the updated row.
- `PATCH /api/batches/:id/settings` returns `403` when called without the Admin mock role.
- `PATCH /api/batches/:id/settings` returns `404` when the batch does not exist.
- `PATCH /api/batches/:id/settings` with an empty body returns `400` validation error.
- `PATCH /api/batches/:id/settings` with an invalid `require_screen_share` value returns `400`.
- If a batch was created before WI-301 (and thus has no explicit settings row), `PATCH` auto-creates default settings before applying updates.
- All queries use parameterized `$N` placeholders (no string interpolation).
- `npm run dev` starts without errors.

---

## Risk / Impact

- **Backfill for existing batches**: Batches created before this work item already have a `batch_settings` row (WI-201's `POST /api/batches` inserts one in a transaction). However, if any batch somehow lacks a settings row (e.g., manually inserted via SQL console), the `PATCH` handler auto-creates defaults before updating. The `GET` handler returns `404` — the caller can then use `PATCH` to trigger creation, or the frontend can handle the `404` gracefully.
- **No validation of business logic**: The endpoints accept any combination of settings. There is no cross-field validation (e.g., disabling mailbox has no automatic effect on `student_to_student_messaging`). Business-logic enforcement happens in the mailbox and meeting controllers (WI-401, WI-501).
- **Open read access**: `GET` is accessible to any role (including anonymous). This matches the Phase 1-7 convention. If settings must be hidden from students in the future, a role check can be added.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-301** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 3 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-301: Feature Settings Backend Logic
* **Work Item ID**: WI-301
* **Summary**: Created GET and PATCH /api/batches/:id/settings endpoints to read and update batch feature permissions (mailbox_enabled, student_to_student_messaging, meeting_join_enabled, require_camera, require_microphone, require_screen_share). PATCH auto-creates default settings if none exist. All mutations require Admin mock role. Zod validation on all fields.
* **Files Affected**:
  - [NEW] `backend/src/routes/batchSettings.js`
  - [MODIFIED] `backend/index.js` (registered /api/batches/:id/settings route group)
  - [MODIFIED] `backend/README.md` (added Batch Settings endpoints)
* **Verification Done**:
  - [x] `GET /api/batches/:id/settings` returns 200 with settings for existing batch
  - [x] `GET /api/batches/:id/settings` returns 404 for non-existent batch
  - [x] `PATCH /api/batches/:id/settings` updates provided fields (Admin only)
  - [x] `PATCH /api/batches/:id/settings` returns 403 for non-Admin roles
  - [x] `PATCH /api/batches/:id/settings` returns 400 for empty body
  - [x] `PATCH /api/batches/:id/settings` returns 400 for invalid enum values
  - [x] `PATCH` auto-creates default settings if no row exists for the batch
  - [x] All queries use parameterized inputs
  - [x] No secrets committed; .env is git-ignored
* **Impact on Existing Functionality**: None. Existing /api/batches routes from WI-201 and /api/users/students routes are unchanged. Existing default settings creation in POST /api/batches is unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-302 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Use `mergeParams: true`**: The settings routes are nested under `:id`. The Router must be created with `mergeParams: true` so `req.params.id` is available from the parent path.
- **The settings table already exists**: The `batch_settings` table was created in WI-104 with all columns and defaults. Do not modify the schema. Do not add new columns — if a setting seems missing, flag it in a change request per `HANDOFF.md` §2.
- **Default settings are already created**: Every new batch created via `POST /api/batches` (WI-201) automatically gets a `batch_settings` row with defaults. The backfill logic in `PATCH` is a safety net only.
- **Zod enum for `require_screen_share`**: The field uses the `public.screen_share_mode` enum in the database (`'REQUIRED'`, `'OPTIONAL'`, `'OFF'`). The Zod schema must use `z.enum(['REQUIRED', 'OPTIONAL', 'OFF'])` to match.
- **Response shape**: All successful responses use `{ data: ... }`. Error responses use `{ error: "...", message: "..." }`.
- **Parameterized queries**: Every SQL query must use `$1`, `$2`, etc. placeholders. Never concatenate user input.
- **Do not touch the frontend**: This is a backend-only work item. Do not modify files in `frontend/`.
- **Do not modify existing route files**: Create `batchSettings.js` as a new file. Do not add settings logic to `batches.js` — keeping them separate maintains clean separation of concerns.
