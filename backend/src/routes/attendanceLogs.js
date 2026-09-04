const { Router } = require('express');
const pool = require('../lib/pgPool');
const { sweepStaleSessions } = require('../lib/attendanceSweeper');

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
// If percentage is null but the student did join (log exists), default to PARTIAL.
function computeAttendanceStatus(percentage, studentActuallyJoined = false) {
  if (percentage === null || percentage === undefined) {
    return studentActuallyJoined ? 'PARTIAL' : null;
  }
  if (percentage >= THRESHOLD_PRESENT * 100) return 'PRESENT';
  if (percentage >= THRESHOLD_PARTIAL * 100) return 'PARTIAL';
  return 'PARTIAL'; // if they joined but < 30%, still counts as PARTIAL not ABSENT (ABSENT = didn't join at all)
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
      `SELECT id, status, is_public, batch_id, is_recurring,
              scheduled_end, recur_end_time, recur_start_time
       FROM public.meetings WHERE id = $1`,
      [id]
    );
    if (meetingRows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }

    const meeting = meetingRows[0];

    // WI-904: Skip attendance for public meetings
    if (meeting.is_public || !meeting.batch_id) {
      return res.json({ data: null, message: 'Public meeting — attendance not recorded' });
    }

    if (meeting.status === 'CANCELLED' || meeting.status === 'ENDED') {
      return res.status(410).json({
        error: 'Gone',
        message: `This meeting has been ${meeting.status.toLowerCase()} and cannot be joined`
      });
    }

    // --- Time-window guard: block new joins after meeting end time ---
    const now = new Date();
    const callerIsAdmin = req.user?.role === 'ADMIN';
    if (!callerIsAdmin) { // Admins can always join
      if (!meeting.is_recurring && meeting.scheduled_end) {
        // One-off meeting: block after scheduled_end
        if (now > new Date(meeting.scheduled_end)) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'This meeting has already ended. New joins are not allowed.'
          });
        }
      } else if (meeting.is_recurring && meeting.recur_end_time) {
        // Recurring meeting: block after recur_end_time for today
        const [endH, endM] = meeting.recur_end_time.split(':').map(Number);
        const todayEnd = new Date();
        todayEnd.setHours(endH, endM, 0, 0);
        if (now > todayEnd) {
          const [startH, startM] = (meeting.recur_start_time || '00:00').split(':').map(Number);
          return res.status(403).json({
            error: 'Forbidden',
            message: `Today's session has ended. You can rejoin tomorrow from ${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}.`
          });
        }
      }
    }

    // --- Room Lifecycle Management ---
    // Auto-finalize ALL stale ACTIVE logs in this meeting
    // Pass userId so the currently joining student never sweeps themselves
    // and increase the threshold inside the sweeper so brief network drops aren't punished.
    await sweepStaleSessions(id, false, userId);

    // Fresh-room check: clear pinned messages when the room officially transitions from Empty -> Occupied
    // We do this unconditionally BEFORE handling the individual user's attendance log 
    // so it doesn't get bypassed if the user is reusing an existing log row.
    const { rows: activeLogsRows } = await pool.query(
      `SELECT id FROM public.attendance_logs
       WHERE meeting_id = $1 AND left_at IS NULL AND status = 'ACTIVE'
       LIMIT 1`,
      [id]
    );

    if (activeLogsRows.length === 0) {
      // Room is completely empty — this is a fresh session start.
      // Wipe ALL polls (votes cascade via FK) and ALL pinned messages for a clean slate.
      await pool.query(
        `DELETE FROM public.meeting_polls WHERE meeting_id = $1`,
        [id]
      );
      await pool.query(
        `DELETE FROM public.meeting_messages WHERE meeting_id = $1 AND is_pinned = true`,
        [id]
      );
    }

    // For recurring meetings: look up existing row scoped to TODAY only (fresh record each day).
    // For one-off meetings: look up by meeting+user alone (consolidated across disconnects).
    const dateClause = meeting.is_recurring ? `AND DATE(joined_at) = CURRENT_DATE` : '';

    // Check for existing attendance log (consolidated)
    let existingRow = null;
    if (userId) {
      // First, forcefully clean up any ghost duplicates from race conditions (multiple devices joining simultaneously)
      // Keep only the most recent row, mark all older ones as left_at = now()
      await pool.query(
        `UPDATE public.attendance_logs
         SET left_at = now()
         WHERE meeting_id = $1 AND user_id = $2 ${dateClause}
           AND left_at IS NULL
           AND id NOT IN (
             SELECT id FROM public.attendance_logs 
             WHERE meeting_id = $1 AND user_id = $2 ${dateClause}
             ORDER BY joined_at DESC LIMIT 1
           )`,
        [id, userId]
      );

      const { rows } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                total_minutes, attendance_percentage, status
         FROM public.attendance_logs
         WHERE meeting_id = $1 AND user_id = $2 ${dateClause}
         ORDER BY joined_at DESC
         LIMIT 1`,
        [id, userId]
      );
      if (rows.length > 0) existingRow = rows[0];
    } else if (externalName) {
      await pool.query(
        `UPDATE public.attendance_logs
         SET left_at = now()
         WHERE meeting_id = $1 AND external_name = $2 ${dateClause}
           AND left_at IS NULL
           AND id NOT IN (
             SELECT id FROM public.attendance_logs 
             WHERE meeting_id = $1 AND external_name = $2 ${dateClause}
             ORDER BY joined_at DESC LIMIT 1
           )`,
        [id, externalName]
      );

      const { rows } = await pool.query(
        `SELECT id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                total_minutes, attendance_percentage, status
         FROM public.attendance_logs
         WHERE meeting_id = $1 AND external_name = $2 ${dateClause}
         ORDER BY joined_at DESC
         LIMIT 1`,
        [id, externalName]
      );
      if (rows.length > 0) existingRow = rows[0];
    }

    if (existingRow) {
      // If it is already active, return as is (idempotent)
      if (existingRow.left_at === null) {
        return res.json({ data: existingRow });
      }

      // If it was previously disconnected, reactivate the SAME row — update only last_joined_at
      // so total_minutes correctly accumulates across sessions (morning + afternoon = single row)
      const { rows: updated } = await pool.query(
        `UPDATE public.attendance_logs
         SET last_joined_at = now(),
             left_at = NULL,
             status = 'ACTIVE'::public.attendance_status,
             last_heartbeat = now(),
             updated_at = now()
         WHERE id = $1
         RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                   last_joined_at, total_minutes, attendance_percentage, status`,
        [existingRow.id]
      );
      // Fire JOIN event
      try {
        await pool.query(
          `INSERT INTO public.attendance_events (attendance_log_id, event_type) VALUES ($1, 'JOIN')`,
          [updated[0].id]
        );
      } catch (evErr) { console.error('event insert failed (rejoin):', evErr.message); }
      return res.json({ data: updated[0] });
    }

    // Insert new attendance log — joined_at and last_joined_at are both set to now()
    const { rows } = await pool.query(
      `INSERT INTO public.attendance_logs (meeting_id, user_id, external_name, joined_at, last_joined_at, last_heartbeat, total_minutes, status)
       VALUES ($1, $2, $3, now(), now(), now(), 0.00, 'ACTIVE')
       RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                 last_joined_at, total_minutes, attendance_percentage, status`,
      [id, userId, externalName]
    );

    // Fire JOIN event
    try {
      await pool.query(
        `INSERT INTO public.attendance_events (attendance_log_id, event_type) VALUES ($1, 'JOIN')`,
        [rows[0].id]
      );
    } catch (evErr) { console.error('event insert failed (new join):', evErr.message); }

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

    // WI-904: Skip attendance for public meetings
    const { rows: meetingCheck } = await pool.query(
      `SELECT is_public, batch_id FROM public.meetings WHERE id = $1`, [id]
    );
    if (meetingCheck.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    }
    if (meetingCheck[0].is_public || !meetingCheck[0].batch_id) {
      return res.json({ data: null, message: 'Public meeting — attendance not recorded' });
    }

    // Find the active attendance log
    let attendanceRow;
    if (userId) {
      const { rows } = await pool.query(
        `SELECT al.id, al.joined_at, al.last_joined_at, al.total_minutes, m.scheduled_start, m.scheduled_end
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
        `SELECT al.id, al.joined_at, al.last_joined_at, al.total_minutes, m.scheduled_start, m.scheduled_end
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
    // Use last_joined_at (current segment start) so we accumulate correctly across rejoins
    const segmentStart = attendanceRow.last_joined_at
      ? new Date(attendanceRow.last_joined_at)
      : new Date(attendanceRow.joined_at);
    const sessionMinutes = (now - segmentStart) / 60000;
    
    // Add current session minutes to existing accumulated total_minutes
    const priorMinutes = parseFloat(attendanceRow.total_minutes) || 0;
    let totalMinutes = Math.round((priorMinutes + sessionMinutes) * 100) / 100;

    let attendancePercentage = null;
    let status = 'PARTIAL'; // default: joined but no scheduled_end → PARTIAL

    if (attendanceRow.scheduled_start && attendanceRow.scheduled_end) {
      // One-off meeting with defined duration
      const scheduledStart = new Date(attendanceRow.scheduled_start);
      const scheduledEnd = new Date(attendanceRow.scheduled_end);
      const meetingDurationMs = scheduledEnd - scheduledStart;
      if (meetingDurationMs > 0) {
        const meetingDurationMin = meetingDurationMs / 60000;
        // Cap minutes at the actual meeting duration
        totalMinutes = Math.min(totalMinutes, meetingDurationMin);
        attendancePercentage = Math.round((totalMinutes / meetingDurationMin) * 100 * 100) / 100;
        if (attendancePercentage > 100) attendancePercentage = 100;
        status = computeAttendanceStatus(attendancePercentage, true);
      }
    } else {
      // Recurring meeting (or meeting without scheduled_end): use recur time window to compute %
      const { rows: recurRows } = await pool.query(
        `SELECT recur_start_time, recur_end_time FROM public.meetings WHERE id = $1`, [id]
      );
      if (recurRows[0]?.recur_start_time && recurRows[0]?.recur_end_time) {
        const [sh, sm] = recurRows[0].recur_start_time.split(':').map(Number);
        const [eh, em] = recurRows[0].recur_end_time.split(':').map(Number);
        const recurDurMin = (eh * 60 + em) - (sh * 60 + sm);
        if (recurDurMin > 0) {
          // Cap minutes at the actual meeting duration
          totalMinutes = Math.min(totalMinutes, recurDurMin);
          attendancePercentage = Math.min(100, Math.round((totalMinutes / recurDurMin) * 100 * 100) / 100);
          status = computeAttendanceStatus(attendancePercentage, true);
        }
      }
      // If no recur config, percentage stays null but status is always PARTIAL (did show up)
    }

    await pool.query(
      `INSERT INTO public.attendance_events (attendance_log_id, event_type) VALUES ($1, 'LEAVE')`,
      [attendanceRow.id]
    );

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

// --- POST /api/meetings/:id/heartbeat ---
// Update the last_heartbeat timestamp on the active attendance log.
// This allows the system to detect stale/disconnected sessions.
// Returns the updated attendance log row.
// 404 if no active session found.

router.post('/heartbeat', async (req, res, next) => {
  try {
    const { id } = req.params;
    const identity = requireIdentity(req, res);
    if (!identity) return;
    const { userId, externalName } = identity;

    // WI-904: Skip attendance for public meetings
    const { rows: hbCheck } = await pool.query(
      `SELECT is_public, batch_id FROM public.meetings WHERE id = $1`, [id]
    );
    if (hbCheck.length === 0) return res.status(404).json({ error: 'Not Found', message: 'Meeting not found' });
    if (hbCheck[0].is_public || !hbCheck[0].batch_id) {
      return res.json({ data: null, message: 'Public meeting — attendance not recorded' });
    }

    // Update last_heartbeat FIRST — must happen before the sweep so the student's
    // own session is not finalised by the sweep before the timestamp is refreshed.
    let result;
    if (userId) {
      result = await pool.query(
        `UPDATE public.attendance_logs
         SET last_heartbeat = now()
         WHERE meeting_id = $1 AND user_id = $2 AND left_at IS NULL
         RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                   total_minutes, attendance_percentage, status`,
        [id, userId]
      );
    } else {
      result = await pool.query(
        `UPDATE public.attendance_logs
         SET last_heartbeat = now()
         WHERE meeting_id = $1 AND external_name = $2 AND left_at IS NULL
         RETURNING id, meeting_id, user_id, external_name, joined_at, left_at, last_heartbeat,
                   total_minutes, attendance_percentage, status`,
        [id, externalName]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No active session found for this user in this meeting'
      });
    }

    // NOW sweep other stale sessions in this meeting
    // Pass userId/externalName so we never accidentally sweep ourselves due to race conditions
    await sweepStaleSessions(id, false, userId || externalName);

    res.json({ data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// --- GET /api/meetings/:id/active-participants ---
// Get list of active participants based on recent heartbeats
router.get('/active-participants', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT 
        al.id, 
        al.user_id, 
        al.external_name, 
        al.joined_at, 
        u.full_name,
        u.email
       FROM public.attendance_logs al
       LEFT JOIN public.users u ON u.id = al.user_id
       WHERE al.meeting_id = $1 
         AND al.left_at IS NULL 
         AND al.last_heartbeat >= now() - interval '90 seconds'
       ORDER BY al.joined_at ASC`,
      [id]
    );

    const data = rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      externalName: r.external_name,
      joinedAt: r.joined_at,
      name: r.full_name || r.external_name || 'Anonymous Guest',
      email: r.email || null
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
