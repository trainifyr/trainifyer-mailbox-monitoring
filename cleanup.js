const pool = require('./backend/src/lib/pgPool');

async function run() {
  try {
    const res = await pool.query(
      `UPDATE public.attendance_logs 
       SET left_at = COALESCE(last_heartbeat, joined_at), 
           status = 'PARTIAL' 
       WHERE left_at IS NULL 
         AND (last_heartbeat IS NULL OR last_heartbeat < now() - interval '10 minutes')`
    );
    console.log(`Updated ${res.rowCount} stale records.`);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}

run();
