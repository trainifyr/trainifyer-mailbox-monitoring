const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const url = process.env.SUPABASE_URL + '/rest/v1/mail_messages';
  const apikey = process.env.SUPABASE_ANON_KEY;

  try {
    // 1. Create secret message between Admin and a NEW Student
    const adminRes = await pool.query("SELECT id FROM public.users WHERE email = 'admin@test.com'");
    const adminId = adminRes.rows[0].id;
    
    // Create or find a "B-Student"
    let bStudentId;
    const bRes = await pool.query("SELECT id FROM public.users WHERE email = 'b_student@test.com'");
    if (bRes.rows.length === 0) {
      const ins = await pool.query("INSERT INTO public.users (email, full_name, role) VALUES ('b_student@test.com', 'B-Student', 'STUDENT') RETURNING id");
      bStudentId = ins.rows[0].id;
    } else {
      bStudentId = bRes.rows[0].id;
    }

    await pool.query(
      "INSERT INTO public.mail_messages (sender_id, receiver_id, subject, body) VALUES ($1, $2, $3, $4)",
      [adminId, bStudentId, 'RLS Isolation Test', 'This message is for B-Student only. Dhruv should not see this.']
    );
    console.log('--- Step 1: Secret message inserted into DB (Admin -> B-Student) ---');

    // 2. Test Student View
    const resStudent = await fetch(url + '?select=*', {
      headers: { 'apikey': apikey, 'Authorization': 'Bearer ' + tokens.studentToken }
    });
    const dataStudent = await resStudent.json();
    console.log(`--- Step 2: Student View ---`);
    console.log(`Messages Visible: ${dataStudent.length}`);
    dataStudent.forEach(m => console.log(`  - MSG: ${m.subject}`));

    // 3. Test Admin View
    const resAdmin = await fetch(url + '?select=*', {
      headers: { 'apikey': apikey, 'Authorization': 'Bearer ' + tokens.adminToken }
    });
    const dataAdmin = await resAdmin.json();
    console.log(`--- Step 3: Admin View ---`);
    console.log(`Messages Visible: ${dataAdmin.length}`);
    dataAdmin.forEach(m => console.log(`  - MSG: ${m.subject}`));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

run();
