const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    
    for (const u of users) {
      const result = await pool.query(
        'UPDATE public.users SET supabase_user_id = $1 WHERE email = $2',
        [u.id, u.email]
      );
      if (result.rowCount > 0) {
        console.log(`Linked ${u.email} to ${u.id}`);
      }
    }
  } catch (err) {
    console.error('Error during linking:', err);
  } finally {
    await pool.end();
  }
}

run();
