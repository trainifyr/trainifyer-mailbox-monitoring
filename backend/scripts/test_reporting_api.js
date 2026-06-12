const fs = require('fs');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const url = 'http://localhost:5000/api/reports';

  try {
    console.log('--- Suite 7: Reporting API Tests ---');

    // 1. Admin accessing full attendance report
    const resAdmin = await fetch(`${url}/attendance`, {
      headers: { Authorization: `Bearer ${tokens.adminToken}` }
    });
    const dataAdmin = await resAdmin.json();
    console.log(`7.1 Admin Reports Status: ${resAdmin.status}`);
    console.log(`Total records visible to Admin: ${dataAdmin.data?.details?.length || 0}`);

    // 2. Student accessing attendance report (Expected block if it's admin-only, OR filtered if shared)
    // Actually reports are usually admin-only except for self-stats.
    const resStudent = await fetch(`${url}/attendance`, {
      headers: { Authorization: `Bearer ${tokens.studentToken}` }
    });
    const dataStudent = await resStudent.json();
    console.log(`7.10/7.11 Student Reports Status: ${resStudent.status}`);
    
    // In our system, GET /api/reports/attendance is open but RLS-filtered for students.
    // Let's verify Student A sees only Student A.
    const logs = dataStudent.data?.details || [];
    console.log(`Total records visible to Student: ${logs.length}`);
    const badLog = logs.find(l => l.email === 'b_student@test.com');
    if (badLog) {
      console.log('❌ FAIL: Student see other student log in report API!');
    } else {
      console.log('✅ PASS: API report data correctly filtered by RLS.');
    }

  } catch (err) {
    console.error('Error during Reports API test:', err);
  }
}

run();
