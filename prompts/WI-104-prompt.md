# WI-104 — Base Database Schema Provisioning

> **GitHub Issue**: #4
> **Phase**: 1 — Skeleton Setup & Mock Session Context
> **Priority**: High
> **Dependencies**: WI-102
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

WI-101 created the folder structure and WI-102 brought the Express backend online with a Mock Session middleware. This work item provisions the **PostgreSQL database schema on Supabase** that every later work item depends on. The schema covers all nine base tables needed for cohorts, the internal mailbox, the Jitsi-based meeting system, privacy consent, and attendance tracking.

> ⚠️ **Mock Context-First Rule**: This work item does **not** touch authentication, JWT, or Supabase Auth. The `supabase_user_id` column in `users` is intentionally **nullable** with **no foreign key** to `auth.users`. Real Auth integration is deferred to **Phase 8 (WI-801 → WI-804)**.
>
> ⚠️ **RLS-Off Rule (TEMPORARY)**: All tables in this work item must have **Row Level Security DISABLED**. RLS policies are written and enabled in **Phase 8 (WI-804)**. Mark the disabling block with `// TODO(PHASE-8: ENABLE RLS)` comments so the security phase can find it.
>
> ⚠️ **No Secret Commits Rule**: All Supabase connection strings and service role keys must live in `backend/.env` and be ignored by git. Never hardcode credentials, real project URLs, or tokens.

---

## Reference Documents

Before starting, read these files in the project root:
- `WORKITEMS.md` — Acceptance criteria for WI-104
- `GOALS.md` — Sub-Goal 2 (Cohort Management), Sub-Goal 4 (Mailbox), Sub-Goal 5 (Meetings), Sub-Goal 6 (Attendance)
- `DEPENDENCIES.md` — Approved versions of `@supabase/supabase-js` and `pg`
- `HANDOFF.md` — Engineering discipline and rules
- `prompts/WI-101-prompt.md` and `WI-102-prompt.md` — Foundation work
- `prompts/WI-103-prompt.md` — Frontend baseline (note the explicit "Do not add Supabase clients — that is WI-104" instruction)
- `ASSUMPTIONS.md` — Single-batch-per-student rule, database-only mailbox, no attachments, no recording
- `VALIDATION.md` — Verification scenarios that rely on these tables (Scenarios A, B, C, D)

---

## Scope of This Work Item

- Define all **nine base tables** as raw DDL: `users`, `batches`, `student_batches`, `batch_settings`, `mail_messages`, `meetings`, `meeting_participants`, `meeting_consents`, `attendance_logs`.
- Define supporting **PostgreSQL enum types** and a shared `set_updated_at()` trigger function.
- Provision the schema on the Supabase project (via a Node migration script using `pg` + `DATABASE_URL`).
- Add a `backend/src/lib/supabaseClient.js` module (the Supabase JS client, service role) for app-level data access in later WIs.
- Add a `backend/src/lib/pgPool.js` module (the `pg` connection pool) for raw SQL operations in this and later WIs.
- Expose a `GET /api/health/db` endpoint that lists the public tables, so manual verification of schema + connectivity is one curl away.
- Add a standalone `npm run db:verify` script that runs the verification queries from the local machine.
- Add the `@supabase/supabase-js` and `pg` packages to `backend/package.json` (versions from `DEPENDENCIES.md`).
- Confirm **RLS is OFF** on every table and that the disabling block is clearly marked for Phase 8.

This is a **database-and-integration** work item. No business-logic routes, no mailbox/meeting/attendance controllers — those come in WI-201, WI-301, WI-401, WI-501, WI-601, etc.

---

## Step-by-Step Instructions

### 1. Add backend dependencies
From `backend/`:
```bash
npm install @supabase/supabase-js pg
```
Use the versions from `DEPENDENCIES.md` (`@supabase/supabase-js ^2.43.0`, `pg ^8.11.5`).

### 2. Create the database folder structure
```
backend/
├── db/
│   ├── schema.sql              # full DDL for all 9 tables + enums + triggers
│   ├── verify.sql              # verification queries (run manually in Supabase SQL editor)
│   └── README.md               # how to run schema.sql against Supabase
├── scripts/
│   ├── apply-schema.js         # applies db/schema.sql using pg + DATABASE_URL
│   └── verify-schema.js        # runs db/verify.sql and prints results
└── src/
    └── lib/
        ├── supabaseClient.js   # @supabase/supabase-js client (service role)
        └── pgPool.js           # pg Pool wrapper
```

### 3. Write `backend/db/schema.sql`
This is the single source of truth for the database. It must be **idempotent** so re-running it does not error. Required contents:

```sql
-- =============================================================
-- WI-104: Base Database Schema
-- Project: Trainifyer Mailbox Monitoring Platform
--
-- IMPORTANT:
--   * RLS is intentionally DISABLED in this phase.
--   * Phase 8 (WI-804) will add policies and enable RLS.
--   * The supabase_user_id column is nullable with NO FK yet.
--     Phase 8 (WI-801) will link it to auth.users.
-- =============================================================

-- 0. Required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- for gen_random_uuid()

-- 1. Enum types
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('ADMIN', 'STUDENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.batch_status AS ENUM ('active', 'inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.screen_share_mode AS ENUM ('REQUIRED', 'OPTIONAL', 'OFF');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.meeting_status AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('PRESENT', 'PARTIAL', 'ABSENT', 'ACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. users
CREATE TABLE IF NOT EXISTS public.users (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- TODO(PHASE-8: LINK TO auth.users.id) - nullable, no FK until Supabase Auth is integrated
  supabase_user_id    uuid NULL,
  email               text UNIQUE NOT NULL,
  full_name           text NOT NULL,
  role                public.user_role NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 3. batches
CREATE TABLE IF NOT EXISTS public.batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  status      public.batch_status NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 4. student_batches
--    UNIQUE (student_id) enforces the MVP single-batch-per-student rule
--    documented in ASSUMPTIONS.md §1.
CREATE TABLE IF NOT EXISTS public.student_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  batch_id    uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_batches_single_batch UNIQUE (student_id)
);
CREATE INDEX IF NOT EXISTS idx_student_batches_batch_id ON public.student_batches(batch_id);

-- 5. batch_settings (one row per batch)
CREATE TABLE IF NOT EXISTS public.batch_settings (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                      uuid NOT NULL UNIQUE REFERENCES public.batches(id) ON DELETE CASCADE,
  mailbox_enabled               boolean NOT NULL DEFAULT true,
  student_to_student_messaging  boolean NOT NULL DEFAULT false,
  meeting_join_enabled          boolean NOT NULL DEFAULT true,
  require_camera                boolean NOT NULL DEFAULT false,
  require_microphone            boolean NOT NULL DEFAULT true,
  require_screen_share          public.screen_share_mode NOT NULL DEFAULT 'OPTIONAL',
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

-- 6. mail_messages (database-only mailbox; no attachments per ASSUMPTIONS.md §2)
CREATE TABLE IF NOT EXISTS public.mail_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  receiver_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  subject      text NOT NULL,
  body         text NOT NULL,
  is_read      boolean NOT NULL DEFAULT false,
  read_at      timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mail_messages_no_self_mail CHECK (sender_id <> receiver_id)
);
CREATE INDEX IF NOT EXISTS idx_mail_messages_receiver_id      ON public.mail_messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_sender_id        ON public.mail_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_mail_messages_receiver_unread  ON public.mail_messages(receiver_id, is_read) WHERE is_read = false;

-- 7. meetings
--    batch_id is NULL for public meetings (WI-501).
CREATE TABLE IF NOT EXISTS public.meetings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  batch_id          uuid NULL REFERENCES public.batches(id) ON DELETE SET NULL,
  jitsi_room_name   text NOT NULL UNIQUE,
  is_public         boolean NOT NULL DEFAULT false,
  scheduled_start   timestamptz NULL,
  scheduled_end     timestamptz NULL,
  status            public.meeting_status NOT NULL DEFAULT 'SCHEDULED',
  created_by        uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meetings_batch_id ON public.meetings(batch_id);
CREATE INDEX IF NOT EXISTS idx_meetings_status   ON public.meetings(status);

-- 8. meeting_participants
--    One of (user_id, external_name) is always set, the other is NULL.
CREATE TABLE IF NOT EXISTS public.meeting_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id       uuid NULL REFERENCES public.users(id) ON DELETE CASCADE,
  external_name text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_participants_identity_chk
    CHECK (user_id IS NOT NULL OR external_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting_id ON public.meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user_id    ON public.meeting_participants(user_id);

-- 9. meeting_consents (privacy consent log)
CREATE TABLE IF NOT EXISTS public.meeting_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id       uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  external_name text NULL,
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  user_agent    text NULL,
  CONSTRAINT meeting_consents_identity_chk
    CHECK (user_id IS NOT NULL OR external_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_meeting_consents_meeting_id ON public.meeting_consents(meeting_id);

-- 10. attendance_logs
--     * user_id / external_name: same identity pattern as participants.
--     * left_at NULL means the user is still in the meeting (status ACTIVE).
--     * WI-601 will compute total_minutes, attendance_percentage, status on leave.
CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id             uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id                uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  external_name          text NULL,
  joined_at              timestamptz NOT NULL DEFAULT now(),
  left_at                timestamptz NULL,
  last_heartbeat         timestamptz NULL,
  total_minutes          numeric(10, 2) NULL,
  attendance_percentage  numeric(5, 2) NULL,
  status                 public.attendance_status NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_logs_identity_chk
    CHECK (user_id IS NOT NULL OR external_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_meeting_id ON public.attendance_logs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_user_id    ON public.attendance_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_active     ON public.attendance_logs(meeting_id) WHERE left_at IS NULL;

-- 11. shared updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'users',
    'batches',
    'batch_settings',
    'meetings',
    'attendance_logs'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- 12. DISABLE Row Level Security on all base tables
-- TODO(PHASE-8: ENABLE RLS) - WI-804 will add policies and re-enable RLS.
ALTER TABLE public.users                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches               DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_batches       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_settings        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_messages         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_consents      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs       DISABLE ROW LEVEL SECURITY;
```

> **Notes**:
> - The `mail_messages_no_self_mail` CHECK is a small safety net — it does not replace permission checks in `WI-401`, but it keeps the data clean.
> - `student_batches_single_batch` is the UNIQUE constraint that enforces the MVP one-batch-per-student rule. The application layer in `WI-201` will surface this as a `409 Conflict` if violated.

### 4. Write `backend/db/verify.sql`
Verification queries for manual inspection in the Supabase SQL editor.

```sql
-- A) All 9 base tables must exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users', 'batches', 'student_batches', 'batch_settings',
    'mail_messages', 'meetings', 'meeting_participants',
    'meeting_consents', 'attendance_logs'
  )
ORDER BY table_name;
-- Expected: 9 rows

-- B) RLS must be disabled (rowsecurity = false) on every base table
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'batches', 'student_batches', 'batch_settings',
    'mail_messages', 'meetings', 'meeting_participants',
    'meeting_consents', 'attendance_logs'
  )
ORDER BY tablename;
-- Expected: rowsecurity = false for all 9

-- C) Foreign-key relationships
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name  AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage        AS kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema   = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- D) supabase_user_id must be nullable and have NO foreign key
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'supabase_user_id';
-- Expected: is_nullable = YES, data_type = uuid

SELECT COUNT(*) AS fk_to_supabase_user_id
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_name  = 'users'
  AND ccu.column_name = 'supabase_user_id';
-- Expected: 0

-- E) updated_at triggers exist on the 5 tables that need them
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('users','batches','batch_settings','meetings','attendance_logs')
ORDER BY event_object_table;
-- Expected: 5 rows
```

### 5. Create `backend/src/lib/pgPool.js`
Thin wrapper around `pg.Pool` using `DATABASE_URL`.

```js
// pg connection pool for raw SQL operations (schema migrations, complex reports).
// Uses DATABASE_URL from .env (Supabase transaction pooler is recommended for free tier).
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in environment');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

module.exports = pool;
```

### 6. Create `backend/src/lib/supabaseClient.js`
Service-role Supabase JS client for app-level data access in later WIs. RLS is off in this phase, so service role is acceptable; the key is still kept out of source control.

```js
// TODO(PHASE-8: REVIEW KEY USAGE) - Service role key is used here because RLS is
// disabled in Phase 1. In Phase 8 (WI-804), RLS policies will replace this
// blanket access and the service role should only be used for admin tasks.

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl        = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabase;
```

### 7. Create `backend/scripts/apply-schema.js`
Applies `db/schema.sql` against the Supabase Postgres instance using the connection pool. Idempotent — safe to re-run.

```js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/lib/pgPool');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const client = await pool.connect();
  try {
    console.log('[SCHEMA] Applying db/schema.sql ...');
    await client.query(sql);
    console.log('[SCHEMA] OK - schema applied (or already up to date).');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[SCHEMA] FAILED:', err);
  process.exit(1);
});
```

### 8. Create `backend/scripts/verify-schema.js`
Runs every query from `db/verify.sql` and prints a pass/fail summary so manual verification is one command.

```js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
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
    return true;
  } catch (e) {
    console.error(`[VERIFY] FAIL - ${name}: ${e.message}`);
    return false;
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
  console.error('[VERIFY] FAILED:', err);
  process.exit(1);
});
```

### 9. Create `backend/db/README.md`
Short doc explaining the migration and verification flow.

```
# Database (Supabase / PostgreSQL)

This folder holds the raw SQL DDL and verification queries for the
Trainifyer Mailbox Monitoring Platform.

## Files
- `schema.sql`   - DDL for all 9 base tables, enums, triggers, and RLS-off block.
- `verify.sql`   - Manual queries to run inside the Supabase SQL editor.

## Apply the schema
From `backend/`:
1. Set `DATABASE_URL` in `backend/.env` to your Supabase transaction-pooler URL.
2. `npm run db:init`

## Verify the schema
From `backend/`:
- `npm run db:verify`   - automated checks (tables, RLS, FKs, supabase_user_id, triggers)

## RLS is OFF
Row Level Security is intentionally disabled in this phase. It will be enabled
in Phase 8 (WI-804) along with RLS policies.
```

### 10. Add `db:init` and `db:verify` scripts to `backend/package.json`
```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js",
  "test": "jest --passWithNoTests",
  "db:init": "node scripts/apply-schema.js",
  "db:verify": "node scripts/verify-schema.js"
}
```

### 11. Add the `GET /api/health/db` endpoint
Extend `backend/index.js` to expose a Supabase-aware health check that lists the public tables. This gives a one-curl verification path and proves the backend can talk to Supabase.

```js
const supabase = require('./src/lib/supabaseClient');

// ...
app.get('/api/health/db', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pg_tables')                                     // not directly queryable; use RPC fallback
      .select('tablename')
      .eq('schemaname', 'public')
      .limit(50);
    if (error) throw error;
    res.status(200).json({ status: 'healthy', tables: data });
  } catch (e) {
    res.status(500).json({ status: 'unhealthy', error: e.message });
  }
});
```

> ⚠️ The PostgREST client does not expose `pg_tables` directly. Use a **Postgres function** for this check. Create a tiny RPC in `schema.sql` (or in a separate migration) and call it from the endpoint:
>
> ```sql
> CREATE OR REPLACE FUNCTION public.list_public_tables()
> RETURNS TABLE(tablename text) AS $$
> BEGIN
>   RETURN QUERY SELECT t.tablename::text
>   FROM pg_tables t
>   WHERE t.schemaname = 'public'
>   ORDER BY t.tablename;
> END;
> $$ LANGUAGE plpgsql STABLE;
> ```
> Then call it via:
> ```js
> const { data, error } = await supabase.rpc('list_public_tables');
> ```
> Add this function to `db/schema.sql` (under section 11 or 13) so it is provisioned in the same migration.

### 12. Update `backend/.env.example`
Confirm it documents `DATABASE_URL` (already there from WI-101). Add a short comment with the recommended pooler port.

```
# Server
PORT=5000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# PostgreSQL Direct Connection (use the Supabase transaction pooler, port 6543)
# Example: postgresql://postgres:<password>@<host>.pooler.supabase.com:6543/postgres
DATABASE_URL=postgresql://user:password@host:6543/postgres
```

### 13. Update `backend/README.md`
Append a short "Database" section:

```
## Database

This service connects to a Supabase PostgreSQL database.

- Apply the schema: `npm run db:init`
- Verify the schema: `npm run db:verify`
- Health check (DB): `GET /api/health/db` returns the list of public tables.

Row Level Security is OFF in Phase 1. It is enabled in Phase 8 (WI-804).
```

### 14. Apply the schema to Supabase
1. Fill in `backend/.env` with real Supabase values:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL` (use the **transaction pooler** URL from the Supabase dashboard → Project Settings → Database → Connection string → Transaction pooler).
2. From `backend/`:
   ```bash
   npm run db:init
   ```
3. Expected log:
   ```
   [SCHEMA] Applying db/schema.sql ...
   [SCHEMA] OK - schema applied (or already up to date).
   ```

### 15. Verify the schema
From `backend/`:
```bash
npm run db:verify
```
Expected:
```
[VERIFY] PASS - A) 9 base tables exist (9 rows)
[VERIFY] PASS - B) RLS disabled on all 9 tables (9 rows)
[VERIFY] PASS - C) Foreign-key relationships exist (N rows)
[VERIFY] PASS - D) supabase_user_id is nullable uuid with no FK (1 row)
[VERIFY] PASS - E) updated_at triggers installed (5 rows)

[VERIFY] 5/5 checks passed.
```

### 16. Verify connectivity from the running backend
1. Start the backend: `npm run dev`
2. Hit the DB health check:
   ```bash
   curl http://localhost:5000/api/health/db
   ```
3. Expected: `200 OK` with a JSON body containing the list of public tables.
4. The response must include all 9 base tables.

### 17. (Optional) Visual confirmation in Supabase
In the Supabase dashboard → Table Editor, confirm the 9 tables are present with the correct columns, foreign keys, and default timestamps. RLS must show as **disabled** for every table.

---

## Expected Output (File Checklist)

- [ ] `backend/db/schema.sql` — Idempotent DDL for all 9 tables, enums, triggers, RLS-off block, and `list_public_tables()` RPC
- [ ] `backend/db/verify.sql` — Manual verification queries
- [ ] `backend/db/README.md` — How to apply and verify
- [ ] `backend/scripts/apply-schema.js` — Runs `db/schema.sql` via `pg`
- [ ] `backend/scripts/verify-schema.js` — Runs the 5 automated checks
- [ ] `backend/src/lib/supabaseClient.js` — `@supabase/supabase-js` service-role client
- [ ] `backend/src/lib/pgPool.js` — `pg` connection pool
- [ ] `backend/index.js` — Adds `GET /api/health/db` endpoint
- [ ] `backend/package.json` — Adds `pg`, `@supabase/supabase-js` deps and `db:init`, `db:verify` scripts
- [ ] `backend/.env.example` — Documents `DATABASE_URL` and pooler recommendation
- [ ] `backend/README.md` — Appends "Database" section

---

## Acceptance Criteria

- `npm run db:init` runs `db/schema.sql` against the configured `DATABASE_URL` and reports success.
- `npm run db:verify` prints `5/5 checks passed`, covering:
  - All 9 base tables exist.
  - RLS is **disabled** on every base table.
  - Foreign-key relationships are present (at least 10 expected from the schema).
  - `users.supabase_user_id` is a nullable `uuid` with no foreign key.
  - `updated_at` triggers exist on the 5 tables that need them.
- `GET /api/health/db` returns `200 OK` and lists all 9 base tables.
- The Supabase JS client (`backend/src/lib/supabaseClient.js`) and the `pg` pool (`backend/src/lib/pgPool.js`) are both available for later WIs.
- The `supabase_user_id` column is **nullable** and has **no foreign key** to `auth.users` (verified by `db:verify` check D).
- The RLS-off block in `schema.sql` is annotated with `TODO(PHASE-8: ENABLE RLS)` for the security hardening phase.
- `db/schema.sql` is **idempotent** — re-running `npm run db:init` must not error and must not duplicate objects.
- The `list_public_tables()` RPC exists in the database and is callable from the backend.
- No real Supabase project URLs, real API keys, or real service-role keys are committed. All secrets live in `backend/.env` (git-ignored).

---

## Risk / Impact

- **RLS is OFF**: This is an accepted, temporary risk for Phase 1. The Supabase REST API and the service role key can both read and write every row. Mitigated by:
  1. The `// TODO(PHASE-8: ENABLE RLS)` marker on the disabling block so it is easy to find in Phase 8.
  2. WI-804 (Phase 8) is on the critical path to close this gap.
- **Single-tenant schema**: All tables live in the `public` schema. There is no multi-tenant isolation by design (see `ASSUMPTIONS.md` §1 — single organization scope).
- **Service role key in backend**: Acceptable in Phase 1 because RLS is off. WI-804 will introduce user-scoped access and reduce reliance on the service role key.
- **Schema changes in later phases**: Columns may be added to support WI-503 (privacy consent metadata), WI-601 (attendance metrics), and WI-701 (report aggregations). Any change to the base tables in this WI must follow the "No Silent Changes" rule from `HANDOFF.md` and produce a change request before being applied.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-104** from `Not Started` to `Done`.
- Increment the `Done` and `Completion %` columns in the Phase 1 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:
```
## [YYYY-MM-DD] - WI-104: Base Database Schema Provisioning
* **Work Item ID**: WI-104
* **Summary**: Provisioned the 9 base PostgreSQL tables on Supabase (users, batches, student_batches, batch_settings, mail_messages, meetings, meeting_participants, meeting_consents, attendance_logs) with enums, FKs, defaults, and updated_at triggers. Added the @supabase/supabase-js service-role client, a pg connection pool, an idempotent db:init migration script, a db:verify checker, and a GET /api/health/db endpoint. RLS is intentionally disabled and marked for Phase 8 (WI-804).
* **Files Affected**:
  - [NEW] `backend/db/schema.sql`
  - [NEW] `backend/db/verify.sql`
  - [NEW] `backend/db/README.md`
  - [NEW] `backend/scripts/apply-schema.js`
  - [NEW] `backend/scripts/verify-schema.js`
  - [NEW] `backend/src/lib/supabaseClient.js`
  - [NEW] `backend/src/lib/pgPool.js`
  - [MODIFIED] `backend/index.js` (added /api/health/db endpoint)
  - [MODIFIED] `backend/package.json` (added pg, @supabase/supabase-js, db:init, db:verify scripts)
  - [MODIFIED] `backend/.env.example` (DATABASE_URL documentation)
  - [MODIFIED] `backend/README.md` (Database section)
* **Verification Done**:
  - [x] `npm run db:init` applies schema.sql successfully
  - [x] `npm run db:verify` reports 5/5 checks passed
  - [x] `GET /api/health/db` returns 200 with all 9 tables
  - [x] RLS confirmed disabled on every base table
  - [x] supabase_user_id is nullable uuid with no FK to auth.users
  - [x] All foreign-key relationships verified
  - [x] schema.sql is idempotent (re-runs do not error)
  - [x] No secrets committed; .env is git-ignored
  - [x] RLS-off block marked with TODO(PHASE-8: ENABLE RLS)
* **Impact on Existing Functionality**: None. Adds database infrastructure; the existing /api/health endpoint and Mock Session middleware from WI-102 are unchanged.
```

### 3. Stop and Wait
Do **not** begin WI-201 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- Do **not** write business-logic routes (no `/api/users`, `/api/batches`, `/api/mail`, `/api/meetings`). Those are added in later work items.
- Do **not** initialize the Supabase JS client on the frontend — that is **WI-801**.
- Do **not** enable RLS or add any RLS policies in this WI. Both are explicitly out of scope until **WI-804**.
- Do **not** add the foreign key from `users.supabase_user_id` to `auth.users(id)`. Phase 8 will do it; adding it now will break the migration because the `auth.users` table is not yet provisioned for app users.
- Do **not** add a real auth check on the new endpoint. The `/api/health/db` endpoint is intentionally open during Phase 1 to match the rest of the Mock Session context.
- Use **transaction pooler** (port `6543`) for `DATABASE_URL` to stay within Supabase free-tier connection limits (`RISKS.md` §2).
- Use `IF NOT EXISTS`, `DO $$ ... EXCEPTION`, and `DROP TRIGGER IF EXISTS` patterns so the migration is **idempotent** — re-running `npm run db:init` is part of the normal developer loop.
- Every file that touches Supabase or RLS-off logic must carry a `TODO(PHASE-8: ENABLE RLS)` or `TODO(PHASE-8: REVIEW KEY USAGE)` comment so the security phase has a clean hit list.
- Keep `db/schema.sql` human-readable: section headers, comments, and consistent formatting. Future developers will read this file directly.
- Do not add any data — only schema. Seeding is the responsibility of later WIs (WI-201 for users/batches).
