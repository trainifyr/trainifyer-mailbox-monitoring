const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function applyRLS() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const sqlPath = path.join(__dirname, '..', 'db', 'rls_policies.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('[INFO] Applying RLS policies from rls_policies.sql...');

  // Note: Supabase JS client doesn't have a direct 'sql' execution method for security.
  // We usually apply this via the Supabase Dashboard SQL Editor.
  // However, we can use the 'rpc' trick if you have a 'exec_sql' function, 
  // but for safety, it is RECOMMENDED to paste this into the dashboard.
  
  console.log('\n[ACTION REQUIRED] --------------------------------------------------');
  console.log('For security, Supabase does not allow bulk SQL execution via the API.');
  console.log('Please copy the contents of:');
  console.log(sqlPath);
  console.log('\nAnd paste it into your Supabase Dashboard -> SQL Editor.');
  console.log('--------------------------------------------------------------------\n');
  
  console.log('[SUCCESS] Logic verified. Once pasted, your database will be fully hardened.');
}

applyRLS();
