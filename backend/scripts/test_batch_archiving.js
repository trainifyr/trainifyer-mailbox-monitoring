require('dotenv').config();

async function run() {
  const url = 'http://localhost:5000/api';
  const headers = {
    'Content-Type': 'application/json',
    'x-mock-role': 'ADMIN',
    'x-mock-user-id': '00000000-0000-0000-0000-000000000000'
  };

  try {
    console.log('--- Batch Archiving Integration Tests (Mock Auth Mode) ---');

    // 1. Create a validation batch
    const batchName = `Verification Batch ${Date.now()}`;
    const resCreate = await fetch(`${url}/batches`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: batchName })
    });
    console.log(`1. Create Batch status: ${resCreate.status}`);
    const resCreateData = await resCreate.json();
    if (resCreate.status !== 201) {
      throw new Error(`Failed to create batch: ${JSON.stringify(resCreateData)}`);
    }
    const batchId = resCreateData.data.id;
    console.log(`Created Batch ID: ${batchId}`);

    // 2. Fetch all batches (should include this batch by default)
    const resGetDefault = await fetch(`${url}/batches`, {
      headers
    });
    const dataGetDefault = await resGetDefault.json();
    const foundInDefault = dataGetDefault.data.find(b => b.id === batchId);
    console.log(`2. Verify exists in default GET: ${foundInDefault ? 'PASS' : 'FAIL'}`);
    if (!foundInDefault) throw new Error('New batch must be returned by default');

    // 3. Archive the batch
    const resArchive = await fetch(`${url}/batches/${batchId}/archive`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isArchived: true })
    });
    console.log(`3. Archive Batch status: ${resArchive.status}`);
    const resArchiveData = await resArchive.json();
    console.log(`Batch is_archived status in response: ${resArchiveData.data.is_archived}`);
    if (resArchiveData.data.is_archived !== true) throw new Error('Expected is_archived = true');

    // 4. Fetch default batches list (should NOT include this batch)
    const resGetDefaultAfter = await fetch(`${url}/batches`, {
      headers
    });
    const dataGetDefaultAfter = await resGetDefaultAfter.json();
    const foundInDefaultAfter = dataGetDefaultAfter.data.find(b => b.id === batchId);
    console.log(`4. Verify hidden from default GET: ${!foundInDefaultAfter ? 'PASS' : 'FAIL'}`);
    if (foundInDefaultAfter) throw new Error('Archived batch must be hidden from default GET');

    // 5. Fetch batches with includeArchived=true (should include this batch)
    const resGetInclude = await fetch(`${url}/batches?includeArchived=true`, {
      headers
    });
    const dataGetInclude = await resGetInclude.json();
    const foundInInclude = dataGetInclude.data.find(b => b.id === batchId);
    console.log(`5. Verify visible in includeArchived GET: ${foundInInclude ? 'PASS' : 'FAIL'}`);
    if (!foundInInclude) throw new Error('Archived batch must show up with includeArchived=true');

    // 6. Restore the batch
    const resRestore = await fetch(`${url}/batches/${batchId}/archive`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ isArchived: false })
    });
    console.log(`6. Restore Batch status: ${resRestore.status}`);
    const resRestoreData = await resRestore.json();
    console.log(`Batch is_archived status after restore: ${resRestoreData.data.is_archived}`);
    if (resRestoreData.data.is_archived !== false) throw new Error('Expected is_archived = false');

    // 7. Verify it is visible by default again
    const resGetDefaultFinal = await fetch(`${url}/batches`, {
      headers
    });
    const dataGetDefaultFinal = await resGetDefaultFinal.json();
    const foundInDefaultFinal = dataGetDefaultFinal.data.find(b => b.id === batchId);
    console.log(`7. Verify visible in final default GET: ${foundInDefaultFinal ? 'PASS' : 'FAIL'}`);
    if (!foundInDefaultFinal) throw new Error('Restored batch must be returned by default again');

    console.log('ALL BATCH ARCHIVING TESTS PASSED!');
  } catch (err) {
    console.error('Test suite failed:', err);
    process.exit(1);
  }
}

run();
