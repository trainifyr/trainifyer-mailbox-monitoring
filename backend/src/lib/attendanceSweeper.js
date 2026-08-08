const pool = require('./pgPool');

const THRESHOLD_PRESENT = 0.75;

/**
 * Finds all active attendance sessions for a meeting that haven't received a heartbeat in >5 minutes,
 * auto-finalizes them (sets left_at = now), recalculates duration, and inserts a LEAVE event.
 */
async function sweepStaleSessions(meetingId = null, forceAll = false) {
  try {
    const timeCondition = forceAll ? '' : `AND (al.last_heartbeat IS NULL OR al.last_heartbeat < now() - interval '5 minutes')`;
    
    const query = meetingId 
      ? `SELECT al.id, al.meeting_id, al.user_id, al.joined_at, al.last_joined_at, al.total_minutes, m.scheduled_start, m.scheduled_end
         FROM public.attendance_logs al
         JOIN public.meetings m ON m.id = al.meeting_id
         WHERE al.meeting_id = $1 AND al.left_at IS NULL
           ${timeCondition}`
      : `SELECT al.id, al.meeting_id, al.user_id, al.joined_at, al.last_joined_at, al.total_minutes, m.scheduled_start, m.scheduled_end
         FROM public.attendance_logs al
         JOIN public.meetings m ON m.id = al.meeting_id
         WHERE al.left_at IS NULL
           ${timeCondition}`;
    
    const { rows: stale } = meetingId ? await pool.query(query, [meetingId]) : await pool.query(query);

    for (const staleLog of stale) {
      const now2 = new Date();
      // Use last_joined_at (segment start) instead of joined_at to get delta for this segment only
      const segmentStart = staleLog.last_joined_at ? new Date(staleLog.last_joined_at) : new Date(staleLog.joined_at);
      const staleMinutes = Math.max(0, Math.round(((now2 - segmentStart) / 60000) * 100) / 100);
      const priorMin2 = parseFloat(staleLog.total_minutes) || 0;
      const totalMin2 = priorMin2 + staleMinutes;
      let stalePct = null;
      let staleStatus = 'PARTIAL';

      if (staleLog.scheduled_start && staleLog.scheduled_end) {
        const durMs = new Date(staleLog.scheduled_end) - new Date(staleLog.scheduled_start);
        if (durMs > 0) {
          stalePct = Math.min(100, Math.round((totalMin2 * 60000 / durMs) * 100 * 100) / 100);
          staleStatus = stalePct >= THRESHOLD_PRESENT * 100 ? 'PRESENT' : 'PARTIAL';
        }
      } else {
        // No scheduled_end: use recur window
        const { rows: recurRows } = await pool.query(
          `SELECT recur_start_time, recur_end_time FROM public.meetings WHERE id = $1`, [staleLog.meeting_id]
        );
        if (recurRows[0]?.recur_start_time && recurRows[0]?.recur_end_time) {
          const [sh, sm] = recurRows[0].recur_start_time.split(':').map(Number);
          const [eh, em] = recurRows[0].recur_end_time.split(':').map(Number);
          const recurDurMin = (eh * 60 + em) - (sh * 60 + sm);
          if (recurDurMin > 0) {
            stalePct = Math.min(100, Math.round((totalMin2 / recurDurMin) * 100 * 100) / 100);
            staleStatus = stalePct >= THRESHOLD_PRESENT * 100 ? 'PRESENT' : 'PARTIAL';
          }
        }
      }

      await pool.query(
        `INSERT INTO public.attendance_events (attendance_log_id, event_type) VALUES ($1, 'LEAVE')`,
        [staleLog.id]
      );

      await pool.query(
        `UPDATE public.attendance_logs SET left_at = now(), total_minutes = $1, attendance_percentage = $2, status = $3::public.attendance_status WHERE id = $4`,
        [totalMin2, stalePct, staleStatus, staleLog.id]
      );
    }
  } catch (e) {
    console.error('Error in sweepStaleSessions:', e);
  }
}

module.exports = { sweepStaleSessions };
