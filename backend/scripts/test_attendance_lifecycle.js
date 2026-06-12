const fs = require('fs');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const url = 'http://localhost:5000/api/meetings';

  try {
    console.log('--- Suite 6: Attendance Lifecycle Tests ---');

    // 0. Get a Meeting ID
    const resM = await fetch(url, {
      headers: { Authorization: `Bearer ${tokens.adminToken}` }
    });
    const meets = await resM.json();
    const mId = meets.data[0].id;
    console.log(`Testing with Meeting ID: ${mId}`);

    // 6.1 Join Log
    const res61 = await fetch(`${url}/${mId}/join-log`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.studentToken}` }
    });
    console.log(`6.1 Join Log: ${res61.status}`);

    // 6.7 Duplicate Join (Idempotency test)
    const res67 = await fetch(`${url}/${mId}/join-log`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.studentToken}` }
    });
    console.log(`6.7 Duplicate Join (Expected 200/Idempotent): ${res67.status}`);

    // 6.2 Heartbeat
    const res62 = await fetch(`${url}/${mId}/heartbeat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.studentToken}` }
    });
    console.log(`6.2 Heartbeat: ${res62.status}`);

    // 6.4 Leave Log (Navigation/Unmount equivalent)
    const res64 = await fetch(`${url}/${mId}/leave-log`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.studentToken}` }
    });
    console.log(`6.4 Leave Log: ${res64.status}`);

  } catch (err) {
    console.error('Error during Attendance Lifecycle test:', err);
  }
}

run();
