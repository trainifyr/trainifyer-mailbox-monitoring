const cron = require('node-cron');
const pool = require('./pgPool');

/**
 * Recurring meeting scheduler.
 * Runs every minute and flips recurring meetings' status between LIVE and SCHEDULED
 * based on the current server time vs. recur_start_time / recur_end_time.
 */
function startRecurringMeetingScheduler() {
  console.log('[SCHEDULER] Recurring meeting scheduler started.');

  cron.schedule('* * * * *', async () => {
    try {
      // Fetch all active recurring meetings
      const { rows: recurringMeetings } = await pool.query(
        `SELECT id, recur_start_time, recur_end_time, status
         FROM public.meetings
         WHERE is_recurring = true AND status != 'CANCELLED'`
      );

      if (recurringMeetings.length === 0) return;

      const now = new Date();
      // Current time as HH:MM:SS for comparison with time columns
      const currentTime = now.toTimeString().slice(0, 8); // e.g. "09:32:00"

      for (const meeting of recurringMeetings) {
        const start = meeting.recur_start_time; // e.g. "09:00:00"
        const end = meeting.recur_end_time;     // e.g. "11:00:00"

        const isInWindow = currentTime >= start && currentTime < end;
        const shouldBeLive = isInWindow;
        const currentlyLive = meeting.status === 'LIVE';

        // Only update if status needs to change
        if (shouldBeLive && !currentlyLive) {
          await pool.query(
            `UPDATE public.meetings SET status = 'LIVE', updated_at = now() WHERE id = $1`,
            [meeting.id]
          );
          console.log(`[SCHEDULER] Meeting ${meeting.id} → LIVE`);
        } else if (!shouldBeLive && currentlyLive) {
          await pool.query(
            `UPDATE public.meetings SET status = 'SCHEDULED', updated_at = now() WHERE id = $1`,
            [meeting.id]
          );
          console.log(`[SCHEDULER] Meeting ${meeting.id} → SCHEDULED`);
        }
      }
    } catch (err) {
      console.error('[SCHEDULER] Error in recurring meeting scheduler:', err.message);
    }
  });
}

module.exports = { startRecurringMeetingScheduler };
