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
      if (!callerUserId) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Mock user ID is required for student reporting'
        });
      }
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

    // --- Build WHERE clause dynamically ---
    const conditions = [];
    const params = [];
    let paramIndex = 0;

    // Only include completed attendance logs (left_at IS NOT NULL) in reports
    conditions.push(`al.left_at IS NOT NULL`);
    // Exclude ACTIVE status from aggregate summaries
    conditions.push(`al.status IS DISTINCT FROM 'ACTIVE'`);
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
      // Handle sessions that started before or on toDate
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
      dateTrunc = "date_trunc('week', al.joined_at)";
    } else if (granularity === 'monthly') {
      dateTrunc = "date_trunc('month', al.joined_at)";
    } else {
      dateTrunc = "date_trunc('day', al.joined_at)";
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
      GROUP BY period
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
        m.batch_id,
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
        series: series.map(s => ({
          ...s,
          total_minutes: parseFloat(s.total_minutes) || 0,
          average_percentage: parseFloat(s.average_percentage) || 0
        })),
        details: details.map(d => ({
          ...d,
          total_minutes: parseFloat(d.total_minutes) || 0,
          attendance_percentage: parseFloat(d.attendance_percentage) || 0
        }))
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

    conditions.push(`al.left_at IS NOT NULL`);
    conditions.push(`al.status IS DISTINCT FROM 'ACTIVE'`);
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
      const status = r.status || 'ABSENT';
      const percentage = r.attendance_percentage ? parseFloat(r.attendance_percentage) : 0.00;
      const duration = r.total_minutes ? parseFloat(r.total_minutes) : 0.00;

      if (status === 'PRESENT') present_count++;
      else if (status === 'PARTIAL') partial_count++;
      else absent_count++;

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
