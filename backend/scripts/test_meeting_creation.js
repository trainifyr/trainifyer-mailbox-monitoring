const fs = require('fs');
require('dotenv').config();

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../tmp/test_tokens.json', 'utf8'));
  const url = 'http://localhost:5000/api';

  try {
    console.log('--- Suite 5: Meeting Creation Tests ---');

    // 0. Get Batch ID
    const resBatches = await fetch(url + '/batches', {
      headers: { Authorization: 'Bearer ' + tokens.adminToken }
    });
    const batches = await resBatches.json();
    const bId = batches.data[0].id;

    // 5.1 Batch Meeting
    const res51 = await fetch(`${url}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ 
        title: 'Batch Meeting', 
        batchId: bId, 
        scheduledStart: new Date().toISOString(), 
        scheduledEnd: new Date(Date.now() + 3600000).toISOString() 
      })
    });
    console.log(`5.1 Batch Meeting: ${res51.status}`);

    // 5.2 Public Meeting
    const res52 = await fetch(`${url}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.adminToken}` },
      body: JSON.stringify({ 
        title: 'Public Meeting', 
        isPublic: true, 
        scheduledStart: new Date().toISOString() 
      })
    });
    console.log(`5.2 Public Meeting: ${res52.status}`);

  } catch (err) {
    console.error('Error during meeting creation test:', err);
  }
}

run();
