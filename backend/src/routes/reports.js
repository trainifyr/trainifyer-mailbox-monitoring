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

module.exports = router;
