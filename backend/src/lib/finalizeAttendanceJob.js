const cron = require('node-cron');
const pool = require('./pgPool');

const THRESHOLD_PRESENT = 0.75; // >= 75%

/**
 * Auto-Finalize Attendance Job.
 *
 * Runs every 5 minutes. Finds any attendance_logs that are still ACTIVE
 * but whose meeting's scheduled_end has already passed. Finalizes them
 * by computing total_minutes, attendance_percentage, and status — exactly
 * the same math used by the manual leave-log route.
 *
 * This ensures final attendance is always visible right after 6:00 PM
 * (or whenever scheduled_end is), even if students didn't click "Leave".
 */
function startFinalizeAttendanceJob() {
  console.log('[AUTO-FINALIZE] Attendance auto-finalize job started (every 5 minutes).');

  cron.schedule('*/5 * * * *', async () => {
    try {
      // Find all ACTIVE logs whose meeting's scheduled_end has passed
      const { rows: staleLogs } = await pool.query(`
        SELECT
          al.id,
          al.joined_at,
          al.total_minutes,
          al.last_heartbeat,
          m.scheduled_start,
          m.scheduled_end,
          m.is_recurring,
          m.recur_start_time,
          m.recur_end_time,
          m.id AS meeting_id
        FROM public.attendance_logs al
        JOIN public.meetings m ON m.id = al.meeting_id
        WHERE al.status = 'ACTIVE'
          AND al.left_at IS NULL
          AND (
            (m.is_recurring = false AND m.scheduled_end IS NOT NULL AND m.scheduled_end < NOW())
            OR (m.is_recurring = true AND m.recur_end_time IS NOT NULL AND (CURRENT_DATE + m.recur_end_time::time) < NOW())
            OR (al.last_heartbeat IS NULL OR al.last_heartbeat < NOW() - interval '5 minutes')
          )
      `);

      if (staleLogs.length === 0) return;

      console.log(`[AUTO-FINALIZE] Found ${staleLogs.length} stale ACTIVE log(s) to finalize.`);

      const now = new Date();

      for (const log of staleLogs) {
        // Determine the fairest left_at time
        let leftAt;
        if (log.last_heartbeat && new Date(log.last_heartbeat) < new Date(now.getTime() - 5 * 60000)) {
          leftAt = new Date(log.last_heartbeat);
        } else if (log.is_recurring) {
          const [h, m] = log.recur_end_time.split(':').map(Number);
          leftAt = new Date();
          leftAt.setHours(h, m, 0, 0);
        } else if (log.scheduled_end) {
          leftAt = new Date(log.scheduled_end);
        } else {
          leftAt = log.last_heartbeat ? new Date(log.last_heartbeat) : new Date(log.joined_at);
        }

        const joinedAt = new Date(log.joined_at);
        const sessionMs = leftAt - joinedAt;
        const sessionMinutes = Math.max(0, sessionMs / 60000);

        const priorMinutes = parseFloat(log.total_minutes) || 0;
        let totalMinutes = Math.round((priorMinutes + sessionMinutes) * 100) / 100;

        let attendancePercentage = null;
        let status = 'PARTIAL'; // default: joined but no way to compute percentage

        if (log.is_recurring && log.recur_start_time && log.recur_end_time) {
          const [sh, sm] = log.recur_start_time.split(':').map(Number);
          const [eh, em] = log.recur_end_time.split(':').map(Number);
          const recurDurMin = (eh * 60 + em) - (sh * 60 + sm);
          
          if (recurDurMin > 0) {
            totalMinutes = Math.min(totalMinutes, recurDurMin); // Cap at max duration
            attendancePercentage = Math.min(100, Math.round((totalMinutes / recurDurMin) * 100 * 100) / 100);
            status = attendancePercentage >= 75 ? 'PRESENT' : 'PARTIAL';
          }
        } else if (log.scheduled_start && log.scheduled_end) {
          const scheduledStart = new Date(log.scheduled_start);
          const scheduledEnd = new Date(log.scheduled_end);
          const meetingDurationMs = scheduledEnd - scheduledStart;

          if (meetingDurationMs > 0) {
            const meetingDurationMin = meetingDurationMs / 60000;
            totalMinutes = Math.min(totalMinutes, meetingDurationMin); // Cap at max duration
            attendancePercentage = Math.round((totalMinutes / meetingDurationMin) * 100 * 100) / 100;
            if (attendancePercentage > 100) attendancePercentage = 100;
            status = attendancePercentage >= 75 ? 'PRESENT' : 'PARTIAL';
          }
        }

        // Insert LEAVE event so the timeline shows in the admin panel
        // Importantly, backdate the event_at to match leftAt exactly, otherwise the UI will use now()
        try {
          await pool.query(
            `INSERT INTO public.attendance_events (attendance_log_id, event_type, event_at) VALUES ($1, 'LEAVE', $2)`,
            [log.id, leftAt]
          );
        } catch (evErr) { console.error('[AUTO-FINALIZE] LEAVE event insert failed:', evErr.message); }

        await pool.query(
          `UPDATE public.attendance_logs
           SET left_at = $1,
               total_minutes = $2,
               attendance_percentage = $3,
               status = $4::public.attendance_status
           WHERE id = $5`,
          [leftAt, totalMinutes, attendancePercentage, status, log.id]
        );

        console.log(
          `[AUTO-FINALIZE] Log ${log.id} finalized → ${status} (${attendancePercentage ?? '—'}%)`
        );
      }
    } catch (err) {
      console.error('[AUTO-FINALIZE] Error in attendance finalize job:', err.message);
    }
  });
}

module.exports = { startFinalizeAttendanceJob };
