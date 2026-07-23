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

// --- GET /api/reports/attendance ---
// Returns aggregated attendance metrics scoped to the caller's role.
// Now uses CTE to generate implicit ABSENT rows for batch students who never joined.
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

    let { userId, batchId, fromDate, toDate, granularity, status } = req.query;

    if (granularity && !GRANULARITIES.includes(granularity)) {
      return res.status(400).json({ error: 'Bad Request', message: `granularity must be one of: ${GRANULARITIES.join(', ')}` });
    }
    if (!granularity) granularity = 'daily';

    if (status && !STATUS_FILTERS.includes(status)) {
      return res.status(400).json({ error: 'Bad Request', message: `status must be one of: ${STATUS_FILTERS.join(', ')}` });
    }

    if (role === 'STUDENT') {
      if (!callerUserId) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Mock user ID is required for student reporting' });
      }
      userId = callerUserId;
      batchId = null;
    } else if (role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden', message: 'Attendance reports require authentication (mock role required)' });
    }

    const params = [];
    let p = 0;

    // Optional filter params
    const userFilter    = userId   ? (params.push(userId),   `$${++p}`) : null;
    const batchFilter   = batchId  ? (params.push(batchId),  `$${++p}`) : null;
    const fromFilter    = fromDate ? (params.push(fromDate), `$${++p}`) : null;
    const toFilter      = toDate   ? (params.push(toDate),   `$${++p}`) : null;
    const statusFilter  = status   ? (params.push(status),   `$${++p}`) : null;

    // --- CTE: Generate every expected (student, meeting, session_date) triple ---
    // Part A: One-off meetings → one session per meeting
    // Part B: Recurring meetings today or LIVE → one session per day with anyone joined + today
    // Then cross-join with all batch students to get expected rows.
    // Finally LEFT JOIN actual attendance_logs to see who actually joined.
    const cteQuery = `
      WITH

      -- Step 1: Produce all meeting sessions (one-off: single row; recurring: one row per day it was live)
      meeting_sessions AS (
        -- Non-recurring meetings that have occurred or are currently live
        SELECT
          m.id            AS meeting_id,
          m.title         AS meeting_title,
          m.batch_id,
          m.is_recurring,
          COALESCE(m.scheduled_start, m.created_at)::date AS session_date,
          COALESCE(m.scheduled_start, m.created_at)      AS session_timestamp
        FROM public.meetings m
        WHERE m.is_recurring = false
          AND m.status IS DISTINCT FROM 'CANCELLED'
          AND (m.scheduled_start <= NOW() OR m.status IN ('LIVE', 'ENDED'))

        UNION

        -- Recurring meetings: one row per date on which ANY participant joined
        SELECT DISTINCT ON (m.id, DATE(al.joined_at))
          m.id            AS meeting_id,
          m.title         AS meeting_title,
          m.batch_id,
          m.is_recurring,
          DATE(al.joined_at)        AS session_date,
          DATE(al.joined_at)::timestamptz AS session_timestamp
        FROM public.meetings m
        JOIN public.attendance_logs al ON al.meeting_id = m.id
        WHERE m.is_recurring = true
          AND m.status IS DISTINCT FROM 'CANCELLED'

        UNION

        -- Recurring meetings that are LIVE today (so today shows up even if nobody joined yet)
        SELECT
          m.id            AS meeting_id,
          m.title         AS meeting_title,
          m.batch_id,
          m.is_recurring,
          CURRENT_DATE           AS session_date,
          NOW()                  AS session_timestamp
        FROM public.meetings m
        WHERE m.is_recurring = true
          AND m.status = 'LIVE'
      ),

      -- Step 2: Deduplicate sessions
      unique_sessions AS (
        SELECT DISTINCT ON (meeting_id, session_date)
          meeting_id, meeting_title, batch_id, is_recurring, session_date, session_timestamp
        FROM meeting_sessions
      ),

      -- Step 3: All batch students (currently enrolled) PLUS any student who historically attended
      batch_students AS (
        SELECT
          sb.student_id AS user_id,
          sb.batch_id,
          b.name AS batch_name,
          u.full_name
        FROM public.student_batches sb
        JOIN public.batches b ON b.id = sb.batch_id
        JOIN public.users u ON u.id = sb.student_id
        WHERE u.role = 'STUDENT'
          ${userFilter  ? `AND sb.student_id = ${userFilter}`  : ''}
          ${batchFilter ? `AND sb.batch_id    = ${batchFilter}` : ''}
          
        UNION
        
        -- Also include any student who attended a meeting in this batch historically
        SELECT DISTINCT
          al.user_id,
          m.batch_id,
          b.name AS batch_name,
          u.full_name
        FROM public.attendance_logs al
        JOIN public.meetings m ON m.id = al.meeting_id
        JOIN public.batches b ON b.id = m.batch_id
        JOIN public.users u ON u.id = al.user_id
        WHERE al.user_id IS NOT NULL 
          AND m.batch_id IS NOT NULL
          AND u.role = 'STUDENT'
          ${userFilter  ? `AND al.user_id = ${userFilter}`  : ''}
          ${batchFilter ? `AND m.batch_id = ${batchFilter}` : ''}
      ),

      -- Step 4: Expected attendance = every (student, session) combination
      expected AS (
        SELECT
          s.meeting_id,
          s.meeting_title,
          s.batch_id,
          bs.batch_name,
          s.session_date,
          s.session_timestamp,
          bs.user_id,
          bs.full_name
        FROM unique_sessions s
        JOIN batch_students bs ON bs.batch_id = s.batch_id
        ${fromFilter ? `WHERE s.session_date >= ${fromFilter}::date` : ''}
        ${toFilter   ? (fromFilter ? `AND` : `WHERE`) + ` s.session_date <= ${toFilter}::date` : ''}
      ),

      -- Step 5: Actual attendance logs per (user, meeting, date)
      actual AS (
        SELECT
          al.meeting_id,
          al.user_id,
          DATE(al.joined_at) AS log_date,
          MIN(al.joined_at)  AS joined_at,
          MAX(al.left_at)    AS left_at,
          SUM(
            al.total_minutes + 
            CASE 
              WHEN al.status = 'ACTIVE' THEN EXTRACT(EPOCH FROM (COALESCE(al.last_heartbeat, al.joined_at) - al.joined_at))/60.0 
              ELSE 0 
            END
          ) AS total_minutes,
          AVG(al.attendance_percentage)::numeric(6,2) AS attendance_percentage,
          -- If any session segment is ACTIVE it's still live; otherwise use best segment status
          MAX(al.status::text)::public.attendance_status AS raw_status
        FROM public.attendance_logs al
        WHERE al.user_id IS NOT NULL
        GROUP BY al.meeting_id, al.user_id, DATE(al.joined_at)
      ),

      -- Step 6: Compute resolved status (PRESENT / PARTIAL / ABSENT) for every expected row
      resolved AS (
        SELECT
          e.meeting_id,
          e.meeting_title,
          e.batch_id,
          e.batch_name,
          e.session_date,
          e.session_timestamp,
          e.user_id,
          e.full_name,
          a.joined_at,
          a.left_at,
          COALESCE(a.total_minutes, 0)          AS total_minutes,
          COALESCE(a.attendance_percentage, 0)   AS attendance_percentage,
          CASE
            WHEN a.user_id IS NULL                          THEN 'ABSENT'
            WHEN a.raw_status = 'ACTIVE'                    THEN 'ACTIVE'
            WHEN COALESCE(a.attendance_percentage, 0) >= 90 THEN 'PRESENT'
            ELSE                                                 'PARTIAL'
          END AS status
        FROM expected e
        LEFT JOIN actual a
          ON a.meeting_id = e.meeting_id
         AND a.user_id    = e.user_id
         AND a.log_date   = e.session_date
      )

      SELECT *
      FROM resolved
      WHERE 1=1
        ${statusFilter ? `AND status = ${statusFilter}` : ''}
    `;

    const allRows = (await pool.query(cteQuery, params)).rows;

    // --- Summary ---
    let total_meetings  = new Set();
    let total_sessions  = 0;
    let total_minutes   = 0;
    let sum_pct         = 0;
    let present_count   = 0;
    let partial_count   = 0;
    let absent_count    = 0;
    for (const r of allRows) {
      total_meetings.add(r.meeting_id);
      total_sessions++;
      total_minutes += parseFloat(r.total_minutes) || 0;
      sum_pct       += parseFloat(r.attendance_percentage) || 0;
      if (r.status === 'PRESENT')  present_count++;
      else if (r.status === 'PARTIAL' || r.status === 'ACTIVE') partial_count++;
      else if (r.status === 'ABSENT') absent_count++;
    }
    const average_percentage = total_sessions > 0 ? sum_pct / total_sessions : 0;

    // --- Time series ---
    const bucketFn = row => {
      const d = new Date(row.session_timestamp || row.session_date);
      if (granularity === 'monthly') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
      if (granularity === 'weekly') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(d.setDate(diff));
        return mon.toISOString().slice(0, 10);
      }
      return (row.session_date instanceof Date ? row.session_date : new Date(row.session_date)).toISOString().slice(0, 10);
    };

    const buckets = {};
    for (const r of allRows) {
      const period = bucketFn(r);
      if (!buckets[period]) buckets[period] = { period, meetings: new Set(), sessions: 0, total_minutes: 0, sum_pct: 0, present_count: 0, partial_count: 0, absent_count: 0 };
      const b = buckets[period];
      b.meetings.add(r.meeting_id);
      b.sessions++;
      b.total_minutes += parseFloat(r.total_minutes) || 0;
      b.sum_pct       += parseFloat(r.attendance_percentage) || 0;
      if (r.status === 'PRESENT')  b.present_count++;
      else if (r.status === 'PARTIAL' || r.status === 'ACTIVE') b.partial_count++;
      else if (r.status === 'ABSENT') b.absent_count++;
    }

    const series = Object.values(buckets)
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(b => ({
        period: b.period,
        meetings: b.meetings.size,
        sessions: b.sessions,
        total_minutes: parseFloat(b.total_minutes.toFixed(2)),
        average_percentage: b.sessions > 0 ? parseFloat((b.sum_pct / b.sessions).toFixed(2)) : 0,
        present_count: b.present_count,
        partial_count: b.partial_count,
        absent_count: b.absent_count
      }));

    // --- Details (limit 500) ---
    const details = allRows.slice(0, 500).map(r => ({
      attendance_log_id: r.attendance_log_id || `implicit-${r.meeting_id}-${r.session_date}`,
      meeting_id:         r.meeting_id,
      meeting_title:      r.meeting_title,
      batch_id:           r.batch_id,
      batch_name:         r.batch_name,
      user_id:            r.user_id,
      user_name:          r.full_name,
      session_date:       r.session_date,
      joined_at:          r.joined_at || r.session_timestamp || null,
      left_at:            r.left_at   || null,
      total_minutes:      r.total_minutes !== null ? parseFloat(r.total_minutes) : null,
      attendance_percentage: r.attendance_percentage !== null ? parseFloat(r.attendance_percentage) : null,
      status:             r.status
    }));

    res.json({
      data: {
        summary: {
          total_meetings:       total_meetings.size,
          total_sessions,
          total_minutes:        parseFloat(total_minutes.toFixed(2)),
          average_percentage:   parseFloat(average_percentage.toFixed(2)),
          present_count,
          partial_count,
          absent_count
        },
        series,
        details
      },
      filters: { userId: userId || null, batchId: batchId || null, fromDate: fromDate || null, toDate: toDate || null, granularity, status: status || null }
    });
  } catch (err) {
    next(err);
  }
});

// --- GET /api/reports/attendance/csv ---
// Returns CSV format of detailed attendance records matching filters.
router.get('/attendance/csv', async (req, res, next) => {
  try {
    const role = req.mockUserRole;
    const callerUserId = req.mockUserId;

    // Parse filters from query
    let { userId, batchId, fromDate, toDate, status } = req.query;

    // Validate status filter
    if (status && !STATUS_FILTERS.includes(status)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `status must be one of: ${STATUS_FILTERS.join(', ')}`
      });
    }

    // --- Role-based access control ---
    if (role === 'STUDENT') {
      if (!callerUserId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Mock user ID is required for student reporting'
        });
      }
      userId = callerUserId;
      batchId = null;
    } else if (role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Attendance reports require authentication (mock role required)'
      });
    }

    // --- Build WHERE clause dynamically ---
    const conditions = [];
    const params = [];
    let paramIndex = 0;

    // Exclude admin/instructor users — their logs are only used for real-time lobby presence
    conditions.push(`NOT EXISTS (SELECT 1 FROM public.users u2 WHERE u2.id = al.user_id AND u2.role = 'ADMIN')`);

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

    const detailsQuery = `
      SELECT
        al.id AS attendance_log_id,
        m.title AS meeting_title,
        b.name AS batch_name,
        u.full_name AS user_name,
        al.external_name,
        al.joined_at,
        al.left_at,
        al.total_minutes,
        al.attendance_percentage,
        al.status
      FROM public.attendance_logs al
      JOIN public.meetings m ON m.id = al.meeting_id
      LEFT JOIN public.batches b ON b.id = m.batch_id
      LEFT JOIN public.users u ON u.id = al.user_id
      ${whereClause}
      ORDER BY al.joined_at DESC
    `;

    const detailsResult = await pool.query(detailsQuery, params);
    const rows = detailsResult.rows;

    // Build CSV
    const headers = [
      'Student',
      'Meeting',
      'Batch',
      'Joined At',
      'Left At',
      'Duration (min)',
      'Attendance %',
      'Status'
    ];

    const escapeCSV = (str) => {
      if (str == null) return '';
      const stringified = String(str);
      if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n') || stringified.includes('\r')) {
        return '"' + stringified.replace(/"/g, '""') + '"';
      }
      return stringified;
    };

    let csvContent = headers.join(',') + '\r\n';
    for (const r of rows) {
      const studentName = r.user_name || r.external_name || '—';
      const rowData = [
        studentName,
        r.meeting_title,
        r.batch_name || 'Public',
        r.joined_at ? new Date(r.joined_at).toISOString() : '—',
        r.left_at ? new Date(r.left_at).toISOString() : '—',
        r.total_minutes != null ? Math.round(r.total_minutes) : '—',
        r.attendance_percentage != null ? Math.round(r.attendance_percentage) : '—',
        r.status || '—'
      ];
      csvContent += rowData.map(escapeCSV).join(',') + '\r\n';
    }

    const filename = `attendance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    next(err);
  }
});

// --- GET /api/reports/attendance/student/:id ---
// Returns a student's full attendance history including meetings they missed (implicit absences).
// Required: caller must be Admin or student requesting their own report.
router.get('/attendance/student/:id', async (req, res, next) => {
  try {
    const role = req.mockUserRole;
    const callerUserId = req.mockUserId;
    const targetUserId = req.params.id;

    // RBAC: Students can only request their own logs
    if (role === 'STUDENT' && callerUserId !== targetUserId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Students can only view their own attendance'
      });
    }

    // 1. Get student's batch ID
    const batchRes = await pool.query(
      `SELECT batch_id FROM public.student_batches WHERE student_id = $1`,
      [targetUserId]
    );
    const batchId = batchRes.rows[0]?.batch_id;

    if (!batchId) {
      // Student is not enrolled in any batch. Return empty shape.
      return res.json({
        data: {
          summary: {
            total_sessions: 0,
            average_percentage: 0,
            present_count: 0,
            partial_count: 0,
            absent_count: 0
          },
          details: []
        }
      });
    }

    // 2. Fetch all virtual sessions (scheduled one-offs and active recurring dates)
    // and LEFT JOIN with the target student's attendance logs on that specific date.
    const query = `
      WITH batch_sessions AS (
        -- A. One-off (non-recurring) meetings that have started/ended
        SELECT 
          m.id AS meeting_id,
          m.title AS meeting_title,
          m.batch_id,
          m.is_recurring,
          COALESCE(m.scheduled_start, m.created_at)::date::text AS session_date,
          COALESCE(m.scheduled_start, m.created_at) AS session_timestamp
        FROM public.meetings m
        WHERE m.batch_id = $2 
          AND m.is_recurring = false
          AND (m.scheduled_start <= NOW() OR m.status IN ('LIVE', 'ENDED'))
          AND m.status IS DISTINCT FROM 'CANCELLED'

        UNION

        -- B. Recurrent meetings: sessions exist on any date when ANY person joined the room
        SELECT DISTINCT ON (m.id, al_date.session_date)
          m.id AS meeting_id,
          m.title AS meeting_title,
          m.batch_id,
          m.is_recurring,
          al_date.session_date::text AS session_date,
          al_date.session_date::timestamp WITH TIME ZONE AS session_timestamp
        FROM public.meetings m
        JOIN (
          SELECT DISTINCT meeting_id, DATE(joined_at) AS session_date
          FROM public.attendance_logs
        ) al_date ON al_date.meeting_id = m.id
        WHERE m.batch_id = $2 
          AND m.is_recurring = true
          AND m.status IS DISTINCT FROM 'CANCELLED'

        UNION

        -- C. Recurrent meetings that are currently LIVE today (so they show up as ABSENT today until joined)
        SELECT 
          m.id AS meeting_id,
          m.title AS meeting_title,
          m.batch_id,
          m.is_recurring,
          CURRENT_DATE::text AS session_date,
          NOW() AS session_timestamp
        FROM public.meetings m
        WHERE m.batch_id = $2 
          AND m.is_recurring = true 
          AND m.status = 'LIVE'
          AND m.status IS DISTINCT FROM 'CANCELLED'
      ),
      unique_sessions AS (
        SELECT DISTINCT ON (meeting_id, session_date)
          meeting_id,
          meeting_title,
          batch_id,
          is_recurring,
          session_date,
          session_timestamp
        FROM batch_sessions
      )
      SELECT 
        us.meeting_id,
        us.meeting_title,
        us.batch_id,
        (SELECT name FROM public.batches WHERE id = us.batch_id) as batch_name,
        us.session_date,
        us.session_timestamp,
        al.id AS attendance_log_id,
        al.joined_at,
        al.left_at,
        al.total_minutes,
        al.attendance_percentage,
        al.status
      FROM unique_sessions us
      LEFT JOIN public.attendance_logs al 
        ON al.meeting_id = us.meeting_id 
        AND al.user_id = $1
        AND DATE(al.joined_at) = us.session_date::date
      ORDER BY us.session_timestamp DESC
    `;
    const { rows } = await pool.query(query, [targetUserId, batchId]);

    // 3. Compute KPI summary metrics
    let total_sessions = rows.length;
    let present_count = 0;
    let partial_count = 0;
    let absent_count = 0;
    let sum_percentages = 0;

    const details = rows.map(r => {
      const percentage = r.attendance_percentage !== null ? parseFloat(r.attendance_percentage) : null;
      const duration = r.total_minutes !== null ? parseFloat(r.total_minutes) : null;
      
      let status = 'ABSENT';
      const hasLog = r.attendance_log_id && !String(r.attendance_log_id).startsWith('implicit-');
      
      if (hasLog) {
        const isPastDay = new Date(r.session_date).toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10);
        
        if (r.status === 'ACTIVE' && !isPastDay) {
          status = 'ACTIVE';
        } else if (percentage !== null && percentage >= 90) {
          status = 'PRESENT';
        } else {
          status = 'PARTIAL'; // if they have a log, they joined (even if 0 minutes), so they are not ABSENT.
        }
      }

      if (status === 'PRESENT') present_count++;
      else if (status === 'PARTIAL') partial_count++;
      else if (status === 'ABSENT') absent_count++;

      sum_percentages += percentage;

      return {
        attendance_log_id: r.attendance_log_id || `implicit-${r.meeting_id}-${r.session_date}`,
        meeting_id: r.meeting_id,
        meeting_title: r.meeting_title,
        batch_id: r.batch_id,
        batch_name: r.batch_name,
        joined_at: r.joined_at || r.session_timestamp,
        left_at: r.left_at || null,
        total_minutes: duration,
        attendance_percentage: percentage,
        status: status
      };
    });

    const average_percentage = total_sessions > 0 ? (sum_percentages / total_sessions) : 0;

    res.json({
      data: {
        summary: {
          total_sessions,
          average_percentage: parseFloat(average_percentage.toFixed(2)),
          present_count,
          partial_count,
          absent_count
        },
        details
      }
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
