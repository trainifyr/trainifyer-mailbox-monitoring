const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const url = process.env.SUPABASE_URL + '/rest/v1/attendance_logs';
  const apikey = process.env.SUPABASE_ANON_KEY;

  try {
    // 1. Setup: Get a Meeting ID to link the log to
    const meetRes = await pool.query("SELECT id FROM public.meetings LIMIT 1");
    if (meetRes.rows.length === 0) {
      console.log('Skipping: No meetings found to link attendance to.');
      return;
    }
    const meetingId = meetRes.rows[0].id;

    // 2. Insert decoy for B-Student
    const bRes = await pool.query("SELECT id FROM public.users WHERE email = 'b_student@test.com'");
    const bId = bRes.rows[0].id;
    await pool.query(
      "INSERT INTO public.attendance_logs (user_id, meeting_id, status) VALUES ($1, $2, 'PRESENT')",
      [bId, meetingId]
    );
    console.log('--- Step 7.11a: Decoy log created for B-Student ---');

    // 3. Check Student A view (Dhruv)
    const resA = await fetch(url + '?select=*', {
      headers: { 'apikey': apikey, 'Authorization': 'Bearer ' + tokens.studentToken }
    });
    const dataA = await resA.json();
    
    console.log('--- Step 7.11b: Student A (Dhruv) View ---');
    console.log(`Logs Visible: ${dataA.length}`);
    
    const leak = dataA.find(log => log.user_id === bId);
    if (leak) {
      console.log('❌ FAIL: RLS Leak! Student A can see Student B attendance.');
    } else {
      console.log('✅ PASS: RLS Isolation working for Attendance Logs.');
    }

  } catch (err) {
    console.error('Error during Attendance RLS test:', err);
  } finally {
    await pool.end();
  }
}

run();
