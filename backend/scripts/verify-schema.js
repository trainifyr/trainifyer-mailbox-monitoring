require('dotenv').config();
const pool = require('../src/lib/pgPool');

const EXPECTED_TABLES = [
  'users', 'batches', 'student_batches', 'batch_settings',
  'mail_messages', 'meetings', 'meeting_participants',
  'meeting_consents', 'attendance_logs'
];

async function check(name, fn) {
  try {
    const res = await fn();
    console.log(`[VERIFY] PASS - ${name} (${res.rowCount} row${res.rowCount === 1 ? '' : 's'})`);
    return 1;
  } catch (e) {
    console.error(`[VERIFY] FAIL - ${name}: ${e.message}`);
    return 0;
  }
}

async function main() {
  const client = await pool.connect();
  let ok = 0, total = 0;
  try {
    total++;
    ok += await check('A) 9 base tables exist', async () => {
      const r = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name = ANY($1::text[])
         ORDER BY table_name`,
        [EXPECTED_TABLES]
      );
      if (r.rowCount !== 9) throw new Error(`expected 9 tables, got ${r.rowCount}`);
      return r;
    });

    total++;
    ok += await check('B) RLS disabled on all 9 tables', async () => {
      const r = await client.query(
        `SELECT tablename, rowsecurity FROM pg_tables
         WHERE schemaname='public' AND tablename = ANY($1::text[])`,
        [EXPECTED_TABLES]
      );
      const bad = r.rows.filter((row) => row.rowsecurity === true);
      if (bad.length) throw new Error(`RLS still ON for: ${bad.map((b) => b.tablename).join(', ')}`);
      return r;
    });

    total++;
    ok += await check('C) Foreign-key relationships exist', async () => {
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.table_constraints
         WHERE constraint_type='FOREIGN KEY' AND table_schema='public'`
      );
      if (r.rows[0].n < 10) throw new Error(`expected at least 10 FKs, got ${r.rows[0].n}`);
      return r;
    });

    total++;
    ok += await check('D) supabase_user_id is nullable uuid with no FK', async () => {
      const r = await client.query(
        `SELECT is_nullable, data_type FROM information_schema.columns
         WHERE table_schema='public' AND table_name='users' AND column_name='supabase_user_id'`
      );
      if (!r.rowCount) throw new Error('supabase_user_id column missing');
      if (r.rows[0].is_nullable !== 'YES') throw new Error('supabase_user_id must be nullable');
      if (r.rows[0].data_type !== 'uuid') throw new Error('supabase_user_id must be uuid');
      return r;
    });

    total++;
    ok += await check('E) updated_at triggers installed', async () => {
      const r = await client.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.triggers
         WHERE trigger_schema='public'
           AND event_object_table IN ('users','batches','batch_settings','meetings','attendance_logs')`
      );
      if (r.rows[0].n < 5) throw new Error(`expected 5 triggers, got ${r.rows[0].n}`);
      return r;
    });

    console.log(`\n[VERIFY] ${ok}/${total} checks passed.`);
    if (ok !== total) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[VERIFY] FAILED:', err.message);
  process.exit(1);
});
