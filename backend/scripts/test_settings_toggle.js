const fs = require('fs');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const url = 'http://localhost:5000/api';

  try {
    // 0. Get Batch ID
    const resBatches = await fetch(url + '/batches', {
      headers: { Authorization: 'Bearer ' + tokens.adminToken }
    });
    const batches = await resBatches.json();
    const bId = batches.data[0].id;
    console.log(`Starting Feature Toggle Test for Batch: ${bId}`);

    // 1. Toggle Mailbox OFF
    await fetch(`${url}/batches/${bId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ mailbox_enabled: false })
    });
    console.log('--- Step 3.2: Mailbox Feature Disabled (Admin) ---');

    // 2. Verify Student Block
    const resBlocked = await fetch(`${url}/mail/inbox`, {
      headers: { Authorization: `Bearer ${tokens.studentToken}` }
    });
    console.log(`--- Step 3.3: Student Verification (Status: ${resBlocked.status}) ---`);
    if (resBlocked.status === 403) {
      console.log('✅ PASS: Student correctly blocked from disabled mailbox.');
    } else {
      console.log('❌ FAIL: Student was NOT blocked from disabled mailbox.');
    }

    // 3. Toggle Mailbox ON
    await fetch(`${url}/batches/${bId}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ mailbox_enabled: true })
    });
    console.log('--- Step 3.4: Mailbox Feature Restored (Admin) ---');

    // 4. Verify Access Restored
    const resAllowed = await fetch(`${url}/mail/inbox`, {
      headers: { Authorization: `Bearer ${tokens.studentToken}` }
    });
    console.log(`--- Step 3.5: Access Restoration (Status: ${resAllowed.status}) ---`);
    if (resAllowed.status === 200) {
      console.log('✅ PASS: Access correctly restored.');
    }

  } catch (err) {
    console.error('Error during settings test:', err);
  }
}

run();
