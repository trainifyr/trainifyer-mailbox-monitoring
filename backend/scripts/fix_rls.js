const { Pool } = require('pg');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const pool = new Pool({
  connectionString: process.env.VITE_SUPABASE_DB_URL || process.env.DATABASE_URL
});

async function main() {
  try {
    await pool.query('CREATE POLICY "Public can update meeting_poll_votes" ON public.meeting_poll_votes FOR UPDATE USING (true);');
    console.log('RLS Update OK!');
  } catch(e) {
    if (e.message.includes('already exists')) console.log('Already exists');
    else console.error(e.message);
  } finally {
    await pool.end();
  }
}

main();
