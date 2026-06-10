# WI-601 — Session Lifecycle Logging API

> **GitHub Issue**: #14
> **Phase**: 6 — Attendance Logging Engine (Slice 5)
> **Priority**: High
> **Dependencies**: WI-503
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-503 added the privacy consent gatekeeper — users must accept monitoring before loading Jitsi. Now that consent is recorded, the platform needs to track **what happens during the meeting**: when the user joined, when they left, and how long they stayed.

The `attendance_logs` table has existed in the database since WI-104, waiting for this work item.

This work item builds the **session lifecycle logging API** — the backend for recording join and leave events and computing attendance metrics. When a user joins a meeting, a row is created in `attendance_logs` with `joined_at`. When they leave, the row is updated with `left_at`, `total_minutes`, `attendance_percentage`, and a computed `status` (Present / Partial / Absent).

> ⚠️ **Attendance Thresholds**: Per `GOALS.md` Sub-Goal 6 and `ASSUMPTIONS.md` §4, attendance percentage is computed as `(total_minutes / meeting_duration_minutes) × 100`. Status thresholds are hardcoded: Present (≥ 75%), Partial (30%–74%), Absent (< 30%). Meeting duration is derived from `scheduled_end - scheduled_start` in the `meetings` table.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-601
- `GOALS.md` — Sub-Goal 6 (Automated Attendance & Duration Calculation)
- `ASSUMPTIONS.md` — §4 Attendance & Analytics (duration-based, constant thresholds)
- `prompts/WI-503-prompt.md` — The consent flow that precedes join-log
- `backend/db/schema.sql` — `attendance_logs` table (lines 145-167)
- `backend/src/routes/meetingConsent.js` — Existing nested route pattern under `/api/meetings/:id/`

---

## Scope of This Work Item

### Backend
- Create **`POST /api/meetings/:id/join-log`** — Record the start of a user's meeting session. Creates an `attendance_logs` row with `joined_at` set to `now()`, status `ACTIVE`, and `left_at`/`total_minutes`/`attendance_percentage` all `NULL`.
- Create **`POST /api/meetings/:id/leave-log`** — Record the end of a user's meeting session. Updates the active attendance log row: sets `left_at` to `now()`, computes `total_minutes` (difference between `left_at` and `joined_at`), computes `attendance_percentage` against the meeting's scheduled duration, and sets `status` (PRESENT / PARTIAL / ABSENT).
- Register the new route file in `backend/index.js`.

This is a **backend-only** work item. The frontend triggers (Jitsi lifecycle events, browser unload, heartbeat pings) are built in WI-602.

---

## Step-by-Step Instructions

### 1. Create the route file

```
backend/src/routes/
├── students.js          (existing — WI-201)
├── batches.js           (existing — WI-201)
├── batchSettings.js     (existing — WI-301)
├── mail.js              (existing — WI-401)
├── meetings.js          (existing — WI-501)
├── meetingConsent.js    (existing — WI-503)
└── attendanceLogs.js    (NEW — WI-601)
```

### 2. Write `backend/src/routes/attendanceLogs.js`

```js
const { Router } = require('express');
const pool = require('../lib/pgPool');

const router = Router({ mergeParams: true });

// --- Constants (from GOALS.md Sub-Goal 6) ---
const THRESHOLD_PRESENT = 0.75;   // >= 75%
const THRESHOLD_PARTIAL = 0.30;   // >= 30% and < 75%

// --- Helpers ---

// Resolve user identity from req.mockUserId or externalName from query params.
// Returns { userId, externalName } — at least one will be non-null.
function resolveIdentity(req) {
  const userId = req.mockUserId || null;
  const externalName = req.query.externalName || null;
  return { userId, externalName };
}

// Validate that at least one identity is present.
function requireIdentity(req, res) {
  const { userId, externalName } = resolveIdentity(req);
  if (!userId && !externalName) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Provide a mock user ID (via headers) or externalName (via query parameter)'
    });
    return null;
  }
  return { userId, externalName };
}

// Compute attendance status from percentage.
function computeAttendanceStatus(percentage) {
  if (percentage === null || percentage === undefined) return null;
  if (percentage >= THRESHOLD_PRESENT * 100) return 'PRESENT';
  if (percentage >= THRESHOLD_PARTIAL * 100) return 'PARTIAL';
  return 'ABSENT';
}

// --- POST /api/meetings/:id/join-log ---
// Record that the current user has joined the meeting.
// - Creates a row in attendance_logs with joined_at = now(), status = ACTIVE.
// - Idempotent: if an active (left_at IS NULL) attendance log already exists
//   for this user+meeting, returns the existing row (200) instead of creating a duplicate (201).
// - Requires either req.mockUserId (authenticated users) or ?externalName= (anonymous).
// - Verifies the meeting exists and is not cancelled/ended.

router.post('/join-log', async (req, res, next) => {
  try {
    const { id } = req.params;
    const identity = requireIdentity(req, res);
    if (!identity) return;
    const { userId, externalName } = identity;

    // Verify the meeting exists
    const { rows: meetingRows } = await pool.query(
      `SELECT id, status FROM public.meetings WHERE id = $1`,
      [id]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    const meeting = meetingRows[0];

    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      return res.status(410).json({
        error: 'Gone',
        message: `This meeting has been ${meeting.status.toLowerCase()} and cannot be joined`
      });
    }

    // Check for existing active attendance log (idempotent)
    if (userId) {
      const { rows: existing } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                total_minutes, attendance_percentage, status
         FROM public.attendance_logs
         WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL
         LIMIT 1`,
        [id, userId]
      );
      if (existing.length > 0) {
        return res.json({ data: existing[0] });
      }
    }

    // Insert new attendance log
    const { rows } = await pool.query(
      `INSERT INTO public.attendance_logs (meeting_id, user_id, external_name, joined_at, status)
       VALUES ($1, $2, $3, now(), 'ACTIVE')
       RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                 total_minutes, attendance_percentage, status`,
      [id, userId, externalName]
    );

    res.status(201).json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

// --- POST /api/meetings/:id/leave-log ---
// Record that the current user has left the meeting.
// - Finds the active (left_at IS NULL) attendance log for this user+meeting.
// - Sets left_at = now().
// - Computes total_minutes = EXTRACT(EPOCH FROM (left_at - joined_at)) / 60.
// - Computes attendance_percentage = (total_minutes / meeting_duration_minutes) * 100.
//   Meeting duration is calculated from scheduled_end - scheduled_start.
//   If scheduled_start or scheduled_end is NULL, percentage and status are set to NULL.
// - Sets status: PRESENT (>=75%), PARTIAL (>=30% and <75%), ABSENT (<30%).
// - Returns 404 if no active log is found (user never joined or already left).

router.post('/leave-log', async (req, res, next) => {
  try {
    const { id } = req.params;
    const identity = requireIdentity(req, res);
    if (!identity) return;
    const { userId, externalName } = identity;

    // Find the active attendance log
    let attendanceRow;
    if (userId) {
      const { rows } = await pool.query(
        `SELECT al.id, al.joined_at, m.scheduled_start, m.scheduled_end
         FROM public.attendance_logs al
         JOIN public.meetings m ON m.id = al.meeting_id
         WHERE al.meeting_id = $1 AND al.user_id = $2 AND al.left_at IS NULL
         LIMIT 1`,
        [id, userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No active session found for this user in this meeting'
        });
      }
      attendanceRow = rows[0];
    } else {
      const { rows } = await pool.query(
        `SELECT al.id, al.joined_at, m.scheduled_start, m.scheduled_end
         FROM public.attendance_logs al
         JOIN public.meetings m ON m.id = al.meeting_id
         WHERE al.meeting_id = $1 AND al.external_name = $2 AND al.left_at IS NULL
         LIMIT 1`,
        [id, externalName]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No active session found for this user in this meeting'
        });
      }
      attendanceRow = rows[0];
    }

    const now = new Date();
    const joinedAt = new Date(attendanceRow.joined_at);
    const diffMs = now - joinedAt;
    const totalMinutes = Math.round((diffMs / 60000) * 100) / 100; // round to 2 decimal places

    let attendancePercentage = null;
    let status = null;

    // Compute percentage if meeting has scheduled start and end
    if (attendanceRow.scheduled_start && attendanceRow.scheduled_end) {
      const scheduledStart = new Date(attendanceRow.scheduled_start);
      const scheduledEnd = new Date(attendanceRow.scheduled_end);
      const meetingDurationMs = scheduledEnd - scheduledStart;

      if (meetingDurationMs > 0) {
        attendancePercentage = Math.round((diffMs / meetingDurationMs) * 100 * 100) / 100;
        status = computeAttendanceStatus(attendancePercentage);
      }
    }

    // Update the attendance log
    const { rows } = await pool.query(
      `UPDATE public.attendance_logs
       SET left_at = now(),
           total_minutes = $1,
           attendance_percentage = $2,
           status = $3::public.attendance_status
       WHERE id = $4
       RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                 total_minutes, attendance_percentage, status`,
      [totalMinutes, attendancePercentage, status, attendanceRow.id]
    );

    res.json({ data: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### 3. Register the attendance logs route in `backend/index.js`

Add after the existing meeting consent route:

```js
// -- Meeting consent routes (WI-503) --
app.use('/api/meetings/:id/consent', require('./src/routes/meetingConsent'));

// -- Attendance log routes (WI-601) --
app.use('/api/meetings/:id', require('./src/routes/attendanceLogs'));
```

### 4. Update `backend/README.md`

Append to the Routes section:

```
### Attendance Logs (WI-601)
- `POST /api/meetings/:id/join-log` — Record a user joining a meeting (creates attendance_log row)
- `POST /api/meetings/:id/leave-log` — Record a user leaving a meeting (computes duration, percentage, status)
```

### 5. Verify the backend

```bash
cd backend
npm run dev
```

Test the attendance endpoints:

```bash
# 1. Seed a meeting (if none exists)
curl -X POST http://localhost:5000/api/meetings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"title": "Attendance Test", "isPublic": true, "scheduledStart": "2026-06-10T09:00:00Z", "scheduledEnd": "2026-06-10T10:00:00Z"}'

# Save the meeting ID from the response.

# 2. Record consent first (required before join-log per WI-503 flow)
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/consent \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"

# 3. Join the meeting as student
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/join-log \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 201 with { data: { joined_at: "...", left_at: null, status: "ACTIVE", ... } }

# 4. Join again (idempotent — should return existing row)
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/join-log \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 200 (not 201) with the same active row

# 5. Leave the meeting
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/leave-log \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 200 with { data: { left_at: "...", total_minutes: "...", attendance_percentage: "...", status: "PRESENT"|"PARTIAL"|"ABSENT" } }

# 6. Leave again (should fail — no active session)
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/leave-log \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 404

# 7. Anonymous user joins a public meeting
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/join-log?externalName=GuestUser \
  -H "Content-Type: application/json"
# Expected: 201 with external_name set

# 8. Anonymous user leaves
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/leave-log?externalName=GuestUser \
  -H "Content-Type: application/json"
# Expected: 200 with computed metrics

# 9. Join without identity (should fail)
curl -X POST http://localhost:5000/api/meetings/<MEETING_ID>/join-log
# Expected: 400

# 10. Join a non-existent meeting
curl -X POST http://localhost:5000/api/meetings/00000000-0000-0000-0000-000000000000/join-log \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: 404
```

### 6. Verify meeting without scheduled duration

```bash
# Create a meeting without scheduled_start/scheduled_end
curl -X POST http://localhost:5000/api/meetings \
  -H "Content-Type: application/json" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001" \
  -d '{"title": "Open Duration Meeting", "isPublic": true}'

# Join and leave — verify percentage and status are NULL
```

---

## Expected Output (File Checklist)

### Backend
- [ ] `backend/src/routes/attendanceLogs.js` — POST handlers for `/api/meetings/:id/join-log` and `/api/meetings/:id/leave-log`
- [ ] `backend/index.js` — Registers the attendance logs route group
- [ ] `backend/README.md` — Documents the new attendance log endpoints

---

## Acceptance Criteria

- `POST /api/meetings/:id/join-log` creates an `attendance_logs` row with `joined_at` set to the current timestamp, `left_at` NULL, `status` = `ACTIVE`, and returns `201`.
- `POST /api/meetings/:id/join-log` is idempotent — calling it again while an active (no `left_at`) row exists returns the existing row with `200`.
- `POST /api/meetings/:id/leave-log` updates the active attendance log: sets `left_at`, computes `total_minutes` as the difference between `left_at` and `joined_at`, computes `attendance_percentage` based on the meeting's scheduled duration, and assigns `status` (PRESENT / PARTIAL / ABSENT).
- `POST /api/meetings/:id/leave-log` on a meeting with no `scheduled_start`/`scheduled_end` sets `attendance_percentage` and `status` to NULL (still computes `total_minutes`).
- `POST /api/meetings/:id/leave-log` returns `404` if no active session exists for this user+meeting.
- `POST /api/meetings/:id/join-log` on a cancelled/ended meeting returns `410`.
- `POST /api/meetings/:id/join-log` without any identity (`req.mockUserId` nor `?externalName=`) returns `400`.
- Anonymous users (identified by `?externalName=`) can join and leave via the same endpoints.
- Attendance status thresholds: PRESENT ≥ 75%, 30% ≤ PARTIAL < 75%, ABSENT < 30% of meeting duration.
- All queries use parameterized `$N` placeholders.
- `npm run dev` starts without errors.

---

## Attendance Status Computation

| Percentage Range | Status |
|----------------|--------|
| ≥ 75%         | PRESENT |
| 30% – 74.99%  | PARTIAL |
| < 30%         | ABSENT |

The formula:

```
attendance_percentage = (total_minutes / meeting_duration_minutes) × 100
```

Where:
- `total_minutes` = `(left_at - joined_at)` in minutes (rounded to 2 decimal places)
- `meeting_duration_minutes` = `(scheduled_end - scheduled_start)` in minutes

If either `scheduled_start` or `scheduled_end` is NULL, the percentage and status are set to NULL in the database (the raw `total_minutes` is still stored).

---

## Risk / Impact

- **No consent gate on attendance logging**: The join-log endpoint does not check whether the user has consented (meeting_consents). The consent check runs on the frontend (WI-503) before Jitsi loads. An attacker who calls join-log directly without consenting would create a log entry. This is an accepted MVP limitation — the frontend is the gatekeeper. Phase 8 hardening can add server-side consent verification.
- **Idempotency is per-user**: If a user disconnects abruptly (no leave-log fired), their active row stays open. WI-602 will add heartbeat ping recovery and timed leave-log triggers (e.g., auto-close after 5 minutes of no heartbeat). For now, stale open rows are possible and can be manually cleaned up.
- **ExternalName identity is fragile**: Anonymous users are identified by `externalName` string. If two anonymous users join with the same `externalName`, the leave-log will match the first active row. This is acceptable for the MVP since anonymous tracking is best-effort. The frontend in WI-602 can generate unique names.
- **Meeting duration is static**: The attendance percentage uses `scheduled_end - scheduled_start`, which is fixed at meeting creation. If a meeting runs long, the percentage will be > 100% (still shows PRESENT). If a meeting ends early, students who attended the full meeting will get > 100% — still treated as PRESENT.
- **All percentage computations are approximate**: The `total_minutes` is computed from the server's clock on join and leave. Network latency, clock skew, and browser delays can affect the exact duration. This is acceptable for the MVP — attendance is not expected to be sub-second accurate.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-601** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 6 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-601: Session Lifecycle Logging API
* **Work Item ID**: WI-601
* **Summary**: Created attendance logging API with two endpoints: POST /api/meetings/:id/join-log (creates attendance_log row with joined_at, status ACTIVE) and POST /api/meetings/:id/leave-log (updates row with left_at, computes total_minutes, attendance_percentage, and status: PRESENT >=75%, PARTIAL 30-74%, ABSENT <30%). Idempotent join (active session returns 200). Identity resolution supports req.mockUserId and ?externalName= for anonymous users.
* **Files Affected**:
  - [NEW] `backend/src/routes/attendanceLogs.js`
  - [MODIFIED] `backend/index.js` (registered /api/meetings/:id route group for attendance)
  - [MODIFIED] `backend/README.md` (added Attendance Logs endpoints)
* **Verification Done**:
  - [x] POST /api/meetings/:id/join-log creates attendance row (201) with ACTIVE status
  - [x] Duplicate join returns existing active row (200, idempotent)
  - [x] POST /api/meetings/:id/leave-log computes total_minutes, attendance_percentage, status
  - [x] Leave on meeting without scheduled duration sets percentage/status to NULL
  - [x] Leave without active session returns 404
  - [x] Join on cancelled/ended meeting returns 410
  - [x] Join without identity returns 400
  - [x] Anonymous join/leave via ?externalName= works
  - [x] All queries use parameterized inputs
  - [x] No secrets committed; .env is git-ignored
* **Impact on Existing Functionality**: None. Existing meetings, consent, mailbox, and cohort routes are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-602 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Nested route pattern**: Like `meetingConsent.js`, this route file uses `Router({ mergeParams: true })` so it inherits `req.params.id` from the parent path `/api/meetings/:id`. The route file does NOT include `/join-log` in its mount path — it's registered as `app.use('/api/meetings/:id', require('./src/routes/attendanceLogs'))`, and the handlers define `router.post('/join-log', ...)`.
- **Identity resolution**: The helper `requireIdentity()` checks `req.mockUserId` first (set by the mock session middleware from headers or query). If that is null, it falls back to `req.query.externalName`. At least one must be present. This mirrors the pattern used in WI-503's consent endpoint where authenticated users use `req.mockUserId` and anonymous users provide `externalName`.
- **Idempotent join**: The join-log endpoint checks for an existing row where `meeting_id = $1 AND user_id = $2 AND left_at IS NULL`. If one exists, it returns the existing row with status 200 instead of creating a new one. This prevents duplicate rows when the frontend retries or when the user refreshes the page.
- **Status computation on leave**: The leave-log endpoint:
  1. Finds the active attendance log (matching user+meeting, `left_at IS NULL`).
  2. Sets `left_at = now()`.
  3. Computes `total_minutes` as `(left_at - joined_at)` in minutes, rounded to 2 decimal places.
  4. Joins the `meetings` table to get `scheduled_start` and `scheduled_end`.
  5. If both are present, computes `attendance_percentage = (total_minutes / meeting_duration_minutes) * 100`.
  6. Assigns `status` via `computeAttendanceStatus()`.
  7. If either scheduled time is NULL, percentage and status are set to NULL.
- **ACTIVE status on join**: The `attendance_logs.status` column uses the `attendance_status` enum. When a user joins, status is set to `'ACTIVE'`. When they leave, it transitions to `'PRESENT'`, `'PARTIAL'`, or `'ABSENT'`.
- **No consent verification**: The join-log endpoint does not check `meeting_consents`. The WI-503 frontend flow ensures consent is recorded before Jitsi loads (and thus before join-log is called). If you want to add a server-side consent check, query `meeting_consents` for the user+meeting and return `403` if no consent record exists. This is **optional** for the MVP.
- **Do not modify the frontend**: This is a backend-only work item. Do not touch `frontend/` files.
- **ExternalName via query param**: Anonymous users pass `?externalName=GuestName` as a query parameter (since POST body parsing could conflict with the nested route). The `requireIdentity` helper reads it from `req.query.externalName`. The leave-log uses the same mechanism.
