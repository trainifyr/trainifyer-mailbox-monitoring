const fs = require('fs');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const url = 'http://localhost:5000/api';

  try {
    console.log('--- Suite 2: Cohort Management Tests ---');

    // 2.5 Create Batch
    const res25 = await fetch(`${url}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ name: `Validation Batch ${Date.now()}` })
    });
    const data25 = await res25.json();
    console.log(`2.5 Create Batch: ${res25.status}`);
    const bId = data25.data.id;

    // 2.2 Create Student
    const res22 = await fetch(`${url}/users/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ email: `val_student_${Date.now()}@test.com`, fullName: 'Val Student', role: 'STUDENT' })
    });
    const data22 = await res22.json();
    console.log(`2.2 Create Student: ${res22.status}`);
    const sId = data22.data.id;

    // 2.6 Assign Student
    const res26 = await fetch(`${url}/batches/${bId}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ studentId: sId })
    });
    console.log(`2.6 Assign Student: ${res26.status}`);

    // 2.7 Assign to second batch (expected 409)
    const resOtherB = await fetch(`${url}/batches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ name: 'Other Batch' })
    });
    const dataOtherB = await resOtherB.json();
    const res27 = await fetch(`${url}/batches/${dataOtherB.data.id}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ studentId: sId })
    });
    console.log(`2.7 Assign Second (Expected 409): ${res27.status}`);

    // 2.8 Toggle batch status
    const res28 = await fetch(`${url}/batches/${bId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ status: 'inactive' })
    });
    console.log(`2.8 Toggle Batch Status: ${res28.status}`);

  } catch (err) {
    console.error('Error during Cohort Management test:', err);
  }
}

run();
