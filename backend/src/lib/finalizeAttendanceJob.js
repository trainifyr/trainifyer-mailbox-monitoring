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
          m.scheduled_start,
          m.scheduled_end,
          m.id AS meeting_id
        FROM public.attendance_logs al
        JOIN public.meetings m ON m.id = al.meeting_id
        WHERE al.status = 'ACTIVE'
          AND al.left_at IS NULL
          AND m.scheduled_end IS NOT NULL
          AND m.scheduled_end < NOW()
      `);

      if (staleLogs.length === 0) return;

      console.log(`[AUTO-FINALIZE] Found ${staleLogs.length} stale ACTIVE log(s) to finalize.`);

      for (const log of staleLogs) {
        // Use scheduled_end as the effective leave time (not "now")
        const leftAt = new Date(log.scheduled_end);
        const joinedAt = new Date(log.joined_at);

        const sessionMs = leftAt - joinedAt;
        const sessionMinutes = sessionMs / 60000;

        const priorMinutes = parseFloat(log.total_minutes) || 0;
        const totalMinutes = Math.round((priorMinutes + sessionMinutes) * 100) / 100;

        let attendancePercentage = null;
        let status = 'PARTIAL'; // default: joined but no way to compute percentage

        if (log.scheduled_start && log.scheduled_end) {
          const scheduledStart = new Date(log.scheduled_start);
          const scheduledEnd = new Date(log.scheduled_end);
          const meetingDurationMs = scheduledEnd - scheduledStart;

          if (meetingDurationMs > 0) {
            attendancePercentage =
              Math.round((totalMinutes * 60000 / meetingDurationMs) * 100 * 100) / 100;
            if (attendancePercentage > 100) attendancePercentage = 100;
            status = attendancePercentage >= THRESHOLD_PRESENT * 100 ? 'PRESENT' : 'PARTIAL';
          }
        }

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
