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
    } else if (externalName) {
      const { rows: existing } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                total_minutes, attendance_percentage, status
         FROM public.attendance_logs
         WHERE meeting_id = $1 AND external_name = $2 AND left_at IS NULL
         LIMIT 1`,
        [id, externalName]
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
