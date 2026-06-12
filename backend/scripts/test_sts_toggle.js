const fs = require('fs');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const url = 'http://localhost:5000/api';

  try {
    // 0. Setup
    const resBatches = await fetch(url + '/batches', {
      headers: { Authorization: 'Bearer ' + tokens.adminToken }
    });
    const batches = await resBatches.json();
    const bId = batches.data[0].id;
    
    const resUsers = await fetch(url + '/users/students', {
      headers: { Authorization: 'Bearer ' + tokens.adminToken }
    });
    const students = await resUsers.json();
    const studentB = students.data.find(s => s.email === 'b_student@test.com');
    if (!studentB) throw new Error('B-Student not found. Run link_users first.');

    console.log(`Starting STS Toggle Test. Target Student B: ${studentB.id}`);

    // 1. Toggle STS OFF
    await fetch(`${url}/batches/${bId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ student_to_student_messaging: false })
    });
    console.log('--- Step 3.5: Student-to-Student Messaging Disabled (Admin) ---');

    // 2. Verify Student -> Student Block
    const resBlocked = await fetch(`${url}/mail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.studentToken}` },
      body: JSON.stringify({ receiverId: studentB.id, subject: 'Spam', body: 'Forbidden msg.' })
    });
    console.log(`--- Step 3.6: Student Verification (Status: ${resBlocked.status}) ---`);
    if (resBlocked.status === 403) {
      console.log('✅ PASS: Student-to-student blocked.');
    }

    // 3. Verify Admin -> Student Bypass
    const resAdmin = await fetch(`${url}/mail/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ receiverId: studentB.id, subject: 'Official', body: 'Admin message.' })
    });
    console.log(`--- Step 3.7: Admin Bypass Verification (Status: ${resAdmin.status}) ---`);
    if (resAdmin.status === 201) {
      console.log('✅ PASS: Admin successfully bypassed STS block.');
    }

    // 4. Cleanup: Toggle STS ON
    await fetch(`${url}/batches/${bId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ student_to_student_messaging: true })
    });

  } catch (err) {
    console.error('Error during STS test:', err);
  }
}

run();
