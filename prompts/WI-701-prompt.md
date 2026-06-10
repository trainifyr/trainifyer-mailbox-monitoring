# WI-701 — Attendance Metrics Query Engine

> **GitHub Issue**: #16
> **Phase**: 7 — Dashboards & Reports (Slice 6)
> **Priority**: Medium
> **Dependencies**: WI-601
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-601 and WI-602 built the session lifecycle pipeline — join-log, heartbeat, leave-log. The `attendance_logs` table now holds raw per-session data: `total_minutes`, `attendance_percentage`, and `status` (PRESENT / PARTIAL / ABSENT / ACTIVE).

This work item builds the **attendance metrics query engine** — a single reporting endpoint that aggregates the raw data into meaningful summaries for dashboards and analytical views. It handles three output levels:

1. **Summary** — Top-level KPIs (total meetings, total minutes, average %, status breakdown).
2. **Time-series** — Data bucketed by day/week/month for line/bar charts.
3. **Details** — Individual attendance log rows for table views and drill-down.

The endpoint is flexible: accepts `userId`, `batchId`, `fromDate`, `toDate`, and `granularity` query filters, and scopes results by role (Admin sees all, Student sees only their own data).

> ⚠️ **Role-Based Scoping**: Per `GOALS.md` Sub-Goal 7, the Admin dashboard shows aggregate cohort metrics; the Student dashboard shows personal stats only. This endpoint enforces that: Student role forces `userId` to their own ID, Admin role can query any filter.

---

## Reference Documents

Before starting, read these files in the project root:

- `WORKITEMS.md` — Acceptance criteria for WI-701
- `GOALS.md` — Sub-Goal 7 (Dashboards and Analytical Reporting)
- `prompts/WI-601-prompt.md` — The attendance_logs table structure and data shape
- `backend/db/schema.sql` — `attendance_logs` table (lines 145-167), `meetings`, `users`, `batches` tables
- `backend/src/routes/meetings.js` — Existing route with role-based data scoping pattern
- `backend/index.js` — Route registration pattern

---

## Scope of This Work Item

### Backend
- Create **`GET /api/reports/attendance`** — Aggregated attendance metrics with three output sections:
  - `summary` — KPI totals across the filtered dataset.
  - `series` — Time-bucketed data for charting (daily/weekly/monthly).
  - `details` — Individual attendance log rows for table display.
- Accept query parameters:
  - `userId` (string, optional) — Filter by student UUID. Student role forces this to their own ID.
  - `batchId` (string, optional) — Filter by batch UUID. Admin only.
  - `fromDate` (string, optional, ISO date `YYYY-MM-DD`) — Inclusive start of date range.
  - `toDate` (string, optional, ISO date `YYYY-MM-DD`) — Inclusive end of date range.
  - `granularity` (string, optional, one of `daily`|`weekly`|`monthly`, default `daily`) — Bucket size for the time series.
  - `status` (string, optional, one of `PRESENT`|`PARTIAL`|`ABSENT`) — Filter by attendance status.
- Register the new route file in `backend/index.js`.
- Update `backend/README.md` with endpoint documentation.

This is a **backend-only** work item. The frontend dashboards that consume this endpoint are built in WI-702.

---

## Step-by-Step Instructions

### 1. Create the route file

```
backend/src/routes/
├── students.js          (existing)
├── batches.js           (existing)
├── batchSettings.js     (existing)
├── mail.js              (existing)
├── meetings.js          (existing)
├── meetingConsent.js    (existing)
├── attendanceLogs.js    (existing — WI-601)
└── reports.js           (NEW — WI-701)
```

### 2. Write `backend/src/routes/reports.js`

```js
const { Router } = require('express');
const pool = require('../lib/pgPool');

const router = Router();

// --- Valid granularities ---
const GRANULARITIES = ['daily', 'weekly', 'monthly'];

// --- Valid status filter values ---
const STATUS_FILTERS = ['PRESENT', 'PARTIAL', 'ABSENT'];

// --- GET /api/reports/attendance ---
// Returns aggregated attendance metrics scoped to the caller's role.
//
// Query params:
//   userId       - Filter by student UUID (forced for STUDENT role)
//   batchId      - Filter by batch UUID (ADMIN only)
//   fromDate     - Inclusive start date (YYYY-MM-DD)
//   toDate       - Inclusive end date (YYYY-MM-DD)
//   granularity  - Bucket size: daily | weekly | monthly (default: daily)
//   status       - Filter by attendance status: PRESENT | PARTIAL | ABSENT

router.get('/attendance', async (req, res, next) => {
  try {
    const role = req.mockUserRole;
    const callerUserId = req.mockUserId;

    // Parse filters from query
    let { userId, batchId, fromDate, toDate, granularity, status } = req.query;

    // Validate granularity
    if (granularity && !GRANULARITIES.includes(granularity)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `granularity must be one of: ${GRANULARITIES.join(', ')}`
      });
    }
    if (!granularity) granularity = 'daily';

    // Validate status filter
    if (status && !STATUS_FILTERS.includes(status)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `status must be one of: ${STATUS_FILTERS.join(', ')}`
      });
    }

    // --- Role-based access control ---
    if (role === 'STUDENT') {
      // Student: force userId to their own ID; ignore batchId
      userId = callerUserId;
      batchId = null;
    } else if (role === 'ADMIN') {
      // Admin: can query any filter; userId and batchId are optional
      // If no userId or batchId is provided, Admin sees all data.
    } else {
      // Anonymous: not allowed — attendance reports require authentication
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Attendance reports require authentication (mock role required)'
      });
    }

    if (!callerUserId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Mock user ID is required'
      });
    }

    // --- Build WHERE clause dynamically ---
    const conditions = [];
    const params = [];
    let paramIndex = 0;

    // Only include completed attendance logs (left_at IS NOT NULL) in reports
    conditions.push(`al.left_at IS NOT NULL`);
    // Exclude ACTIVE status from aggregate summaries
    conditions.push(`al.status IS DISTINCT FROM 'ACTIVE'`);

    if (userId) {
      paramIndex++;
      conditions.push(`al.user_id = $${paramIndex}`);
      params.push(userId);
    }

    if (batchId) {
      paramIndex++;
      conditions.push(`m.batch_id = $${paramIndex}`);
      params.push(batchId);
    }

    if (fromDate) {
      paramIndex++;
      conditions.push(`al.joined_at >= $${paramIndex}::timestamptz`);
      params.push(fromDate);
    }

    if (toDate) {
      paramIndex++;
      conditions.push(`(al.left_at <= $${paramIndex}::timestamptz OR al.joined_at <= $${paramIndex}::timestamptz)`);
      params.push(toDate);
    }

    if (status) {
      paramIndex++;
      conditions.push(`al.status = $${paramIndex}::public.attendance_status`);
      params.push(status);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // --- 1. Summary (top-level KPIs) ---
    const summaryQuery = `
      SELECT
        COUNT(DISTINCT al.meeting_id)::int AS total_meetings,
        COUNT(al.id)::int AS total_sessions,
        COALESCE(SUM(al.total_minutes), 0) AS total_minutes,
        COALESCE(AVG(al.attendance_percentage), 0) AS average_percentage,
        COUNT(al.id) FILTER (WHERE al.status = 'PRESENT')::int AS present_count,
        COUNT(al.id) FILTER (WHERE al.status = 'PARTIAL')::int AS partial_count,
        COUNT(al.id) FILTER (WHERE al.status = 'ABSENT')::int AS absent_count
      FROM public.attendance_logs al
      JOIN public.meetings m ON m.id = al.meeting_id
      ${whereClause}
    `;

    const summaryResult = await pool.query(summaryQuery, params);
    const summary = summaryResult.rows[0];

    // --- 2. Time series (bucketed by granularity) ---
    let dateTrunc;
    if (granularity === 'weekly') {
      dateTrunc = 'date_trunc(\'week\', al.joined_at)';
    } else if (granularity === 'monthly') {
      dateTrunc = 'date_trunc(\'month\', al.joined_at)';
    } else {
      dateTrunc = 'date_trunc(\'day\', al.joined_at)';
    }

    const seriesQuery = `
      SELECT
        ${dateTrunc}::date AS period,
        COUNT(DISTINCT al.meeting_id)::int AS meetings,
        COUNT(al.id)::int AS sessions,
        COALESCE(SUM(al.total_minutes), 0) AS total_minutes,
        COALESCE(AVG(al.attendance_percentage), 0) AS average_percentage,
        COUNT(al.id) FILTER (WHERE al.status = 'PRESENT')::int AS present_count,
        COUNT(al.id) FILTER (WHERE al.status = 'PARTIAL')::int AS partial_count,
        COUNT(al.id) FILTER (WHERE al.status = 'ABSENT')::int AS absent_count
      FROM public.attendance_logs al
      JOIN public.meetings m ON m.id = al.meeting_id
      ${whereClause}
      GROUP BY ${dateTrunc}::date
      ORDER BY period ASC
    `;

    const seriesResult = await pool.query(seriesQuery, params);
    const series = seriesResult.rows;

    // --- 3. Details (individual rows for table display) ---
    const detailsQuery = `
      SELECT
        al.id AS attendance_log_id,
        al.meeting_id,
        m.title AS meeting_title,
        b.name AS batch_name,
        u.full_name AS user_name,
        al.user_id,
        al.external_name,
        al.joined_at,
        al.left_at,
        al.total_minutes,
        al.attendance_percentage,
        al.status,
        al.last_heartbeat
      FROM public.attendance_logs al
      JOIN public.meetings m ON m.id = al.meeting_id
      LEFT JOIN public.batches b ON b.id = m.batch_id
      LEFT JOIN public.users u ON u.id = al.user_id
      ${whereClause}
      ORDER BY al.joined_at DESC
      LIMIT 500
    `;

    const detailsResult = await pool.query(detailsQuery, params);
    const details = detailsResult.rows;

    // --- Response ---
    res.json({
      data: {
        summary: {
          total_meetings: parseInt(summary.total_meetings) || 0,
          total_sessions: parseInt(summary.total_sessions) || 0,
          total_minutes: parseFloat(summary.total_minutes) || 0,
          average_percentage: parseFloat(summary.average_percentage) || 0,
          present_count: parseInt(summary.present_count) || 0,
          partial_count: parseInt(summary.partial_count) || 0,
          absent_count: parseInt(summary.absent_count) || 0
        },
        series,
        details
      },
      filters: {
        userId: userId || null,
        batchId: batchId || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        granularity,
        status: status || null
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### 3. Register the reports route in `backend/index.js`

Add after the existing route registrations (before the 404 handler):

```js
// -- Attendance log routes (WI-601) --
app.use('/api/meetings/:id', require('./src/routes/attendanceLogs'));

// -- Reports routes (WI-701) --
app.use('/api/reports', require('./src/routes/reports'));
```

### 4. Update `backend/README.md`

Append to the Routes section:

```
### Reports (WI-701)
- `GET /api/reports/attendance` — Aggregated attendance metrics with summary KPIs, time-bucketed series, and detail rows (role-scoped, filterable by userId/batchId/dates/status)
```

### 5. Seed test data for verification

If you don't have completed attendance data, run these SQL inserts to create some:

```sql
-- Ensure test users exist
INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin@test.com', 'Admin User', 'ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000002', 'rahul@test.com', 'Rahul Sharma', 'STUDENT')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, role)
VALUES ('00000000-0000-0000-0000-000000000003', 'priya@test.com', 'Priya Patel', 'STUDENT')
ON CONFLICT (id) DO NOTHING;

-- Ensure a batch exists
INSERT INTO public.batches (id, name)
VALUES ('00000000-0000-0000-0000-000000000010', 'Cohort-1')
ON CONFLICT (id) DO NOTHING;

-- Assign students
INSERT INTO public.student_batches (student_id, batch_id)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000010')
ON CONFLICT (student_id) DO NOTHING;

INSERT INTO public.student_batches (student_id, batch_id)
VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000010')
ON CONFLICT (student_id) DO NOTHING;

-- Create a few meetings with scheduled times
INSERT INTO public.meetings (id, title, batch_id, jitsi_room_name, is_public, scheduled_start, scheduled_end, status, created_by)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Math Lecture 1', '00000000-0000-0000-0000-000000000010', 'trainifyer-a1-math-1', false, '2026-06-09 09:00:00+00', '2026-06-09 10:00:00+00', 'ENDED', '00000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', 'Science Lab', '00000000-0000-0000-0000-000000000010', 'trainifyer-b2-science', false, '2026-06-10 09:00:00+00', '2026-06-10 10:30:00+00', 'ENDED', '00000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'Guest Speaker', null, 'trainifyer-c3-guest', true, '2026-06-11 14:00:00+00', '2026-06-11 15:00:00+00', 'ENDED', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Insert some attendance logs (completed sessions)
INSERT INTO public.attendance_logs (id, meeting_id, user_id, joined_at, left_at, last_heartbeat, total_minutes, attendance_percentage, status)
VALUES
  -- Rahul attended Math full (100%)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '2026-06-09 09:00:00+00', '2026-06-09 10:00:00+00', '2026-06-09 10:00:00+00', 60, 100, 'PRESENT'),
  -- Rahul attended Science for 45 min out of 90 (50% -> PARTIAL)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '2026-06-10 09:00:00+00', '2026-06-10 09:45:00+00', '2026-06-10 09:45:00+00', 45, 50, 'PARTIAL'),
  -- Rahul missed Guest Speaker entirely
  -- Priya attended Math for 30 min (50% -> PARTIAL)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', '2026-06-09 09:15:00+00', '2026-06-09 09:45:00+00', '2026-06-09 09:45:00+00', 30, 50, 'PARTIAL'),
  -- Priya attended Science full (100%)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '2026-06-10 09:00:00+00', '2026-06-10 10:30:00+00', '2026-06-10 10:30:00+00', 90, 100, 'PRESENT'),
  -- Priya attended Guest Speaker for 15 min (25% -> ABSENT)
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', '2026-06-11 14:00:00+00', '2026-06-11 14:15:00+00', '2026-06-11 14:15:00+00', 15, 25, 'ABSENT')
ON CONFLICT (id) DO NOTHING;
```

### 6. Verify the implementation

Start the backend:

```bash
cd backend
npm run dev
```

Test each scenario:

```bash
# --- Admin queries ---

# 1. Admin gets full report (no filters — all data)
curl "http://localhost:5000/api/reports/attendance" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 200 with summary (total_meetings: 3, total_sessions: 5),
#           series (daily buckets), and details (5 rows)

# 2. Admin filters by batch
curl "http://localhost:5000/api/reports/attendance?batchId=00000000-0000-0000-0000-000000000010" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: Only cohort meetings (excludes public meeting if batchId filter applied)

# 3. Admin filters by student
curl "http://localhost:5000/api/reports/attendance?userId=00000000-0000-0000-0000-000000000002" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: Only Rahul's sessions (2 rows)

# 4. Admin filters by date range
curl "http://localhost:5000/api/reports/attendance?fromDate=2026-06-10&toDate=2026-06-11" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: Only sessions from June 10-11

# 5. Admin filters by status
curl "http://localhost:5000/api/reports/attendance?status=PARTIAL" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: Only PARTIAL sessions (2 rows)

# 6. Admin uses weekly granularity
curl "http://localhost:5000/api/reports/attendance?granularity=weekly" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: Series bucketed by week

# 7. Admin uses monthly granularity
curl "http://localhost:5000/api/reports/attendance?granularity=monthly" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: Series bucketed by month

# --- Student queries ---

# 8. Student gets their own report (no userId param — forced to own ID)
curl "http://localhost:5000/api/reports/attendance" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: Only Rahul's sessions (2 rows). batchId param ignored.

# 9. Student tries to specify a different userId (should be overridden)
curl "http://localhost:5000/api/reports/attendance?userId=00000000-0000-0000-0000-000000000003" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: Still returns Rahul's data (userId forced to caller's ID)

# 10. Student uses filters (date range + status)
curl "http://localhost:5000/api/reports/attendance?fromDate=2026-06-09&toDate=2026-06-09&status=PARTIAL" \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000002"
# Expected: Rahul's PARTIAL session on June 9 only

# --- Edge cases ---

# 11. Anonymous user (no role) — should fail
curl "http://localhost:5000/api/reports/attendance"
# Expected: 403 Forbidden

# 12. Invalid granularity
curl "http://localhost:5000/api/reports/attendance?granularity=yearly" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 400 Bad Request

# 13. No data scenario (query a date range with no sessions)
curl "http://localhost:5000/api/reports/attendance?fromDate=2025-01-01&toDate=2025-01-31" \
  -H "x-mock-role: ADMIN" \
  -H "x-mock-user-id: 00000000-0000-0000-0000-000000000001"
# Expected: 200 with summary all zeros, empty series, empty details
```

---

## Expected Output (File Checklist)

### Backend
- [ ] `backend/src/routes/reports.js` — GET /api/reports/attendance with summary, series, details
- [ ] `backend/index.js` — Registers /api/reports route group
- [ ] `backend/README.md` — Documents the attendance reports endpoint

---

## Acceptance Criteria

- `GET /api/reports/attendance` returns a `data` object with three sections: `summary`, `series`, `details`.
- `summary` contains `total_meetings`, `total_sessions`, `total_minutes`, `average_percentage`, `present_count`, `partial_count`, `absent_count`.
- `series` is an array of time-bucketed rows with `period` (date), `meetings`, `sessions`, `total_minutes`, `average_percentage`, and status counts.
- `details` is an array of individual attendance log rows with `meeting_title`, `batch_name`, `user_name`, `joined_at`, `left_at`, `total_minutes`, `attendance_percentage`, `status`.
- The response includes a `filters` object echoing the applied query parameters.
- Admin role can query any combination of `userId`, `batchId`, `fromDate`, `toDate`, `granularity`, and `status`.
- Student role forces `userId` to the caller's `req.mockUserId` and ignores `batchId`.
- Anonymous role (no mock role) returns `403`.
- Missing `req.mockUserId` returns `401`.
- Invalid `granularity` returns `400` with an error listing valid values.
- `granularity` defaults to `daily` if not provided.
- Only completed attendance logs (`left_at IS NOT NULL`, status != `ACTIVE`) are included in results.
- Results are limited to 500 detail rows (pagination deferred).
- All queries use parameterized `$N` placeholders.
- `npm run dev` starts without errors.

---

## Response Shape

```json
{
  "data": {
    "summary": {
      "total_meetings": 3,
      "total_sessions": 5,
      "total_minutes": 240,
      "average_percentage": 65,
      "present_count": 2,
      "partial_count": 2,
      "absent_count": 1
    },
    "series": [
      {
        "period": "2026-06-09",
        "meetings": 1,
        "sessions": 2,
        "total_minutes": 90,
        "average_percentage": 75,
        "present_count": 1,
        "partial_count": 1,
        "absent_count": 0
      },
      {
        "period": "2026-06-10",
        "meetings": 1,
        "sessions": 2,
        "total_minutes": 135,
        "average_percentage": 75,
        "present_count": 1,
        "partial_count": 1,
        "absent_count": 0
      },
      {
        "period": "2026-06-11",
        "meetings": 1,
        "sessions": 1,
        "total_minutes": 15,
        "average_percentage": 25,
        "present_count": 0,
        "partial_count": 0,
        "absent_count": 1
      }
    ],
    "details": [
      {
        "attendance_log_id": "...",
        "meeting_id": "...",
        "meeting_title": "Science Lab",
        "batch_name": "Cohort-1",
        "user_name": "Priya Patel",
        "user_id": "...",
        "external_name": null,
        "joined_at": "2026-06-10T09:00:00Z",
        "left_at": "2026-06-10T10:30:00Z",
        "total_minutes": 90,
        "attendance_percentage": 100,
        "status": "PRESENT",
        "last_heartbeat": "2026-06-10T10:30:00Z"
      }
    ]
  },
  "filters": {
    "userId": null,
    "batchId": null,
    "fromDate": null,
    "toDate": null,
    "granularity": "daily",
    "status": null
  }
}
```

---

## Access Control Summary

| User | Can See | userId filter | batchId filter |
|------|---------|---------------|----------------|
| ADMIN | All attendance data | Optional — any user | Optional — any batch |
| STUDENT | Only their own | Forced to caller's ID | Ignored (always null) |
| Anonymous | None (403) | — | — |

---

## Risk / Impact

- **Query performance**: The endpoint runs three separate SQL queries (summary, series, details) on every request. Each joins `attendance_logs` with `meetings` and optionally `batches` and `users`. For large datasets (thousands of sessions), the series query could be slow. The 500-row limit on details mitigates this for the MVP. Future optimization could add pagination (offset/limit) and materialized views.
- **No pagination on details**: The `details` query is limited to 500 rows with `LIMIT 500`. If a user has more than 500 attendance records, only the most recent 500 are returned. Full pagination (with `page` and `pageSize` query params) can be added in a future enhancement.
- **Date filter uses `joined_at` only**: The `fromDate`/`toDate` filters apply to `al.joined_at`. A session that started before `fromDate` but ended within the range is excluded. This is intentional — the join timestamp defines which period a session belongs to. The `toDate` also checks `left_at` to catch sessions that started before the range but ended inside it.
- **Time-series buckets use `joined_at`**: The series groups by the `joined_at` date truncated to the chosen granularity. A session that spans midnight (e.g., a meeting that crosses into the next day) is attributed to the day it started.
- **Average percentage is unweighted**: The `average_percentage` in both summary and series is the arithmetic mean of all `attendance_percentage` values in the filtered set. It does not weight by session duration. For a duration-weighted average, use `total_minutes` and compute client-side if needed.
- **No real-time data**: The endpoint only includes completed sessions (`left_at IS NOT NULL`). Currently active sessions (status `ACTIVE`) are excluded from reports. If real-time dashboard data is needed later, add a separate endpoint or query parameter to include active sessions.
- **Student role forces their own userId**: A student cannot view another student's attendance data. The `userId` query parameter is silently overridden. This is enforced server-side — a malicious student cannot bypass it by omitting the userId header.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-701** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 7 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-701: Attendance Metrics Query Engine
* **Work Item ID**: WI-701
* **Summary**: Created GET /api/reports/attendance endpoint with three output sections: summary (KPIs: total meetings, total minutes, average %, status breakdown), series (time-bucketed daily/weekly/monthly data for charts), and details (individual attendance log rows). Role-scoped: Admin sees all, Student sees only their own data. Filterable by userId, batchId, date range, granularity, and status.
* **Files Affected**:
  - [NEW] `backend/src/routes/reports.js`
  - [MODIFIED] `backend/index.js` (registered /api/reports route group)
  - [MODIFIED] `backend/README.md` (added Reports endpoint documentation)
* **Verification Done**:
  - [x] Admin gets summary, series, and details with no filters
  - [x] Admin can filter by userId, batchId, fromDate, toDate, status
  - [x] Granularity param works (daily/weekly/monthly)
  - [x] Student role forces userId to their own ID
  - [x] Student cannot see other students' data
  - [x] Anonymous requests return 403
  - [x] Invalid granularity returns 400
  - [x] Only completed sessions (left_at IS NOT NULL, status != ACTIVE) are included
  - [x] Details limited to 500 rows
  - [x] All queries use parameterized inputs
  - [x] No secrets committed; .env is git-ignored
* **Impact on Existing Functionality**: None. Existing meeting, consent, mailbox, and attendance routes are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-702 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **Three queries, one endpoint**: The endpoint executes three separate SQL queries sequentially (summary → series → details). Each uses the same dynamic `WHERE` clause, built from the query parameters. The `whereClause` string is constructed by pushing conditions into an array and joining with `AND` — this prevents SQL injection because all values are passed as parameterized `$N` placeholders.
- **Dynamic WHERE clause construction**: The conditions array starts with two fixed clauses: `al.left_at IS NOT NULL` and `al.status IS DISTINCT FROM 'ACTIVE'`. This ensures only completed sessions are included in reports. The remaining conditions are appended based on query parameters. The `paramIndex` counter ensures correct `$N` numbering.
- **Role enforcement happens before query building**: The role check at the top of the handler modifies the `userId` and `batchId` variables before they are used to build the WHERE clause. For STUDENT role, `userId` is overwritten with `callerUserId` and `batchId` is set to `null`. This means the SQL conditions are built with the correct values — no separate query logic is needed per role.
- **Date truncation for granularity**: PostgreSQL's `date_trunc` function is used to bucket timestamps. The truncation unit is controlled by the `granularity` parameter: `'day'`, `'week'`, or `'month'`. The result is cast to `::date` for a clean date display. The truncated date is aliased as `period`.
- **Status filtering uses attendance_status enum cast**: The `status` query parameter is cast to `public.attendance_status` enum in the SQL: `al.status = $N::public.attendance_status`. Only `PRESENT`, `PARTIAL`, and `ABSENT` are valid filters (not `ACTIVE`).
- **Response structure is flat `data` object**: Unlike some existing endpoints that wrap responses in `{ data: ... }`, the reports endpoint nests three sub-objects under `data`: `summary`, `series`, and `details`. A separate `filters` object echoes the applied query parameters for client-side filter display.
- **No pagination yet**: The details query has a hard `LIMIT 500`. Future work can add `page` and `pageSize` query params with offset-based pagination. The MVP limitation is documented in the Risk section.
- **Numeric precision**: `total_minutes` and `average_percentage` are parsed as floats from the database. The `COUNT` results are parsed as integers. This matches the `numeric(10,2)` and `numeric(5,2)` column types in the schema.
- **Do not modify the frontend**: This is a backend-only work item. Do not touch `frontend/` files.
- **The `reports.js` file is NOT under `/api/meetings/:id`**: Unlike `meetingConsent.js` and `attendanceLogs.js`, the reports route is mounted at `/api/reports` directly — no `mergeParams` needed.
