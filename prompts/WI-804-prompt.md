# WI-804 — Supabase Row Level Security (RLS) Policies

> **GitHub Issue**: #21
> **Phase**: 8 — Authentication & Security Hardening (Blocker Phase)
> **Priority**: Critical
> **Dependencies**: WI-802
> **Project**: Trainifyer Mailbox Monitoring Platform

---

## Context

The database schema (WI-104) was created with RLS **disabled** on all tables. In Phases 1–7 the backend relies on middleware-level authorization (`mockSession.js`, `requireRole.js`) and direct `pgPool` connections — both of which bypass RLS entirely. With WI-802 now providing real JWT validation on the backend, this work item adds database-level Row Level Security as a **defense-in-depth** layer.

RLS prevents unauthorized data access through the Supabase REST API (e.g., someone using the Supabase anon key to enumerate rows). Even though the backend's `pgPool` (superuser) and `supabaseClient` (service-role key) bypass RLS, any direct Supabase REST queries without a valid JWT must be blocked.

Key design decisions:

1. **All 9 tables** get RLS enabled and permissive-but-scoped policies.
2. **Anonymous access** (no JWT) is blocked for all read operations. Specific INSERT policies allow anonymous meeting participation/consent/attendance via `external_name`.
3. **Role checks** use a subquery against `public.users` (via `supabase_user_id` → `auth.uid()`) rather than custom JWT claims, because the service-role JWT used by the backend does not carry the user's application role.
4. **`supabaseClient.js`** already uses the service-role key (bypasses RLS). This work item also adds a second, **anon-key client** (`supabaseAnonClient.js`) that respects RLS — laying the groundwork for future client-side Supabase queries if needed.

> ⚠️ **Non-breaking**: No backend logic changes. The `pgPool` and service-role `supabaseClient` continue to work identically. RLS only applies to direct Supabase REST API calls made with the anon key.

---

## Reference Documents

Before starting, read these files:

- `WORKITEMS.md` — Acceptance criteria for WI-804
- `GOALS.md` — Sub-Goal 1 (Authentication & Role-Based Access Control)
- `prompts/WI-802-prompt.md` — Backend JWT middleware that sets `req.user` with `{ id, sub: supabase_user_id, role, email }`
- `backend/db/schema.sql` — Full DDL of all 9 tables, current RLS-disabled statements (lines 206–216)
- `backend/src/lib/pgPool.js` — Direct PostgreSQL connection (superuser, bypasses RLS)
- `backend/src/lib/supabaseClient.js` — Service-role Supabase client (bypasses RLS)

---

## Scope of This Work Item

### Backend — New
- **Create** `backend/db/rls_policies.sql` — All RLS policies for every table, with named, granular policies (SELECT/INSERT/UPDATE/DELETE per role).
- **Create** `backend/src/lib/supabaseAnonClient.js` — Anon-key Supabase client for RLS-respecting queries (future use).

### Backend — Modified
- **Update** `backend/db/schema.sql` — Change all 9 `DISABLE ROW LEVEL SECURITY` statements to `ENABLE ROW LEVEL SECURITY`.

### Backend — No Changes
- Backend route files, middleware, and `requireRole.js` are **not modified**. The backend continues to use `pgPool` (superuser) which bypasses RLS.

---

## Step-by-Step Instructions

### 1. Create `backend/db/rls_policies.sql`

This file defines all RLS policies in a single idempotent migration. It must be run **after** WI-104's schema is applied.

Structure: For each table, first drop existing policies (idempotent), then enable RLS, then create policies.

```sql
-- =============================================================
-- WI-804: Row Level Security Policies
-- Project: Trainifyer Mailbox Monitoring Platform
--
-- Apply AFTER backend/db/schema.sql.
-- This file is idempotent — safe to re-run.
-- =============================================================

-- Helper: check if the current JWT user is an admin in public.users
-- Usage: WHERE public.is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE supabase_user_id = auth.uid()
      AND role = 'ADMIN'
  );
$$;

-- =============================================================
-- 1. users
-- =============================================================
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_select_admin" ON public.users;
DROP POLICY IF EXISTS "users_update_own"  ON public.users;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Students can only see their own record
CREATE POLICY "users_select_own" ON public.users
  FOR SELECT
  USING (supabase_user_id = auth.uid());

-- Admins can see all users
CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT
  USING (public.is_admin());

-- Users can update their own record (e.g., full_name)
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE
  USING (supabase_user_id = auth.uid())
  WITH CHECK (supabase_user_id = auth.uid());

-- INSERT/DELETE are admin-only via service-role key or pgPool.

-- =============================================================
-- 2. batches
-- =============================================================
DROP POLICY IF EXISTS "batches_select_authenticated" ON public.batches;
DROP POLICY IF EXISTS "batches_insert_admin"         ON public.batches;
DROP POLICY IF EXISTS "batches_update_admin"         ON public.batches;
DROP POLICY IF EXISTS "batches_delete_admin"         ON public.batches;

ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read batches
CREATE POLICY "batches_select_authenticated" ON public.batches
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Only admins can modify batches
CREATE POLICY "batches_insert_admin" ON public.batches
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "batches_update_admin" ON public.batches
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "batches_delete_admin" ON public.batches
  FOR DELETE
  USING (public.is_admin());

-- =============================================================
-- 3. student_batches
-- =============================================================
DROP POLICY IF EXISTS "student_batches_select_own"   ON public.student_batches;
DROP POLICY IF EXISTS "student_batches_select_admin" ON public.student_batches;
DROP POLICY IF EXISTS "student_batches_insert_admin" ON public.student_batches;
DROP POLICY IF EXISTS "student_batches_update_admin" ON public.student_batches;
DROP POLICY IF EXISTS "student_batches_delete_admin" ON public.student_batches;

ALTER TABLE public.student_batches ENABLE ROW LEVEL SECURITY;

-- Students see their own batch assignment
CREATE POLICY "student_batches_select_own" ON public.student_batches
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = student_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Admins see all
CREATE POLICY "student_batches_select_admin" ON public.student_batches
  FOR SELECT
  USING (public.is_admin());

-- Admin-only write operations
CREATE POLICY "student_batches_insert_admin" ON public.student_batches
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "student_batches_update_admin" ON public.student_batches
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "student_batches_delete_admin" ON public.student_batches
  FOR DELETE
  USING (public.is_admin());

-- =============================================================
-- 4. batch_settings
-- =============================================================
DROP POLICY IF EXISTS "batch_settings_select_own_batch"   ON public.batch_settings;
DROP POLICY IF EXISTS "batch_settings_select_admin"       ON public.batch_settings;
DROP POLICY IF EXISTS "batch_settings_insert_admin"       ON public.batch_settings;
DROP POLICY IF EXISTS "batch_settings_update_admin"       ON public.batch_settings;
DROP POLICY IF EXISTS "batch_settings_delete_admin"       ON public.batch_settings;

ALTER TABLE public.batch_settings ENABLE ROW LEVEL SECURITY;

-- Students see settings only for their own batch
CREATE POLICY "batch_settings_select_own_batch" ON public.batch_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.student_batches sb
      JOIN public.users u ON u.id = sb.student_id
      WHERE sb.batch_id = batch_settings.batch_id
        AND u.supabase_user_id = auth.uid()
    )
  );

-- Admins see all
CREATE POLICY "batch_settings_select_admin" ON public.batch_settings
  FOR SELECT
  USING (public.is_admin());

-- Admin-only write operations
CREATE POLICY "batch_settings_insert_admin" ON public.batch_settings
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "batch_settings_update_admin" ON public.batch_settings
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "batch_settings_delete_admin" ON public.batch_settings
  FOR DELETE
  USING (public.is_admin());

-- =============================================================
-- 5. mail_messages
-- =============================================================
DROP POLICY IF EXISTS "mail_messages_select_participant" ON public.mail_messages;
DROP POLICY IF EXISTS "mail_messages_select_admin"       ON public.mail_messages;
DROP POLICY IF EXISTS "mail_messages_insert_sender"     ON public.mail_messages;
DROP POLICY IF EXISTS "mail_messages_update_receiver"   ON public.mail_messages;

ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;

-- Users see messages where they are sender OR receiver
CREATE POLICY "mail_messages_select_participant" ON public.mail_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE (id = sender_id OR id = receiver_id)
        AND supabase_user_id = auth.uid()
    )
  );

-- Admins can read all messages (for monitoring/support)
CREATE POLICY "mail_messages_select_admin" ON public.mail_messages
  FOR SELECT
  USING (public.is_admin());

-- Users can send messages as themselves
CREATE POLICY "mail_messages_insert_sender" ON public.mail_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = sender_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Receiver can mark a message as read
CREATE POLICY "mail_messages_update_receiver" ON public.mail_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = receiver_id
        AND supabase_user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Only allow updating is_read and read_at
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = receiver_id
        AND supabase_user_id = auth.uid()
    )
  );

-- =============================================================
-- 6. meetings
-- =============================================================
DROP POLICY IF EXISTS "meetings_select_accessible" ON public.meetings;
DROP POLICY IF EXISTS "meetings_select_admin"      ON public.meetings;
DROP POLICY IF EXISTS "meetings_insert_admin"      ON public.meetings;
DROP POLICY IF EXISTS "meetings_update_admin"      ON public.meetings;
DROP POLICY IF EXISTS "meetings_delete_admin"      ON public.meetings;

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Authenticated users see: public meetings OR meetings in their batch (via student_batches) OR meetings they created
CREATE POLICY "meetings_select_accessible" ON public.meetings
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      is_public = true
      OR
      EXISTS (
        SELECT 1 FROM public.student_batches sb
        JOIN public.users u ON u.id = sb.student_id
        WHERE sb.batch_id = meetings.batch_id
          AND u.supabase_user_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM public.users
        WHERE id = meetings.created_by
          AND supabase_user_id = auth.uid()
      )
    )
  );

-- Admins see all meetings
CREATE POLICY "meetings_select_admin" ON public.meetings
  FOR SELECT
  USING (public.is_admin());

-- Admin-only write operations
CREATE POLICY "meetings_insert_admin" ON public.meetings
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "meetings_update_admin" ON public.meetings
  FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "meetings_delete_admin" ON public.meetings
  FOR DELETE
  USING (public.is_admin());

-- =============================================================
-- 7. meeting_participants
-- =============================================================
DROP POLICY IF EXISTS "meeting_participants_select_own"       ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_select_admin"     ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_insert_auth"     ON public.meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_insert_anon"     ON public.meeting_participants;

ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

-- Users see their own participant records
CREATE POLICY "meeting_participants_select_own" ON public.meeting_participants
  FOR SELECT
  USING (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Admins see all
CREATE POLICY "meeting_participants_select_admin" ON public.meeting_participants
  FOR SELECT
  USING (public.is_admin());

-- Authenticated users can join meetings
CREATE POLICY "meeting_participants_insert_auth" ON public.meeting_participants
  FOR INSERT
  WITH CHECK (
    user_id IS NOT NULL
    AND external_name IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Anonymous users can join meetings via external_name
CREATE POLICY "meeting_participants_insert_anon" ON public.meeting_participants
  FOR INSERT
  WITH CHECK (
    auth.role() = 'anon'
    AND user_id IS NULL
    AND external_name IS NOT NULL
  );

-- =============================================================
-- 8. meeting_consents
-- =============================================================
DROP POLICY IF EXISTS "meeting_consents_select_own"     ON public.meeting_consents;
DROP POLICY IF EXISTS "meeting_consents_select_admin"   ON public.meeting_consents;
DROP POLICY IF EXISTS "meeting_consents_insert_auth"   ON public.meeting_consents;
DROP POLICY IF EXISTS "meeting_consents_insert_anon"   ON public.meeting_consents;

ALTER TABLE public.meeting_consents ENABLE ROW LEVEL SECURITY;

-- Users see their own consents
CREATE POLICY "meeting_consents_select_own" ON public.meeting_consents
  FOR SELECT
  USING (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Admins see all
CREATE POLICY "meeting_consents_select_admin" ON public.meeting_consents
  FOR SELECT
  USING (public.is_admin());

-- Authenticated users can record consent
CREATE POLICY "meeting_consents_insert_auth" ON public.meeting_consents
  FOR INSERT
  WITH CHECK (
    user_id IS NOT NULL
    AND external_name IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Anonymous users can record consent via external_name
CREATE POLICY "meeting_consents_insert_anon" ON public.meeting_consents
  FOR INSERT
  WITH CHECK (
    auth.role() = 'anon'
    AND user_id IS NULL
    AND external_name IS NOT NULL
  );

-- =============================================================
-- 9. attendance_logs
-- =============================================================
DROP POLICY IF EXISTS "attendance_logs_select_own"     ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_select_admin"   ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_insert_auth"   ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_insert_anon"   ON public.attendance_logs;
DROP POLICY IF EXISTS "attendance_logs_update_own"    ON public.attendance_logs;

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

-- Users see their own attendance records
CREATE POLICY "attendance_logs_select_own" ON public.attendance_logs
  FOR SELECT
  USING (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Admins see all attendance records
CREATE POLICY "attendance_logs_select_admin" ON public.attendance_logs
  FOR SELECT
  USING (public.is_admin());

-- Authenticated users can insert their own attendance (join-log)
CREATE POLICY "attendance_logs_insert_auth" ON public.attendance_logs
  FOR INSERT
  WITH CHECK (
    user_id IS NOT NULL
    AND external_name IS NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  );

-- Anonymous users can have attendance tracked via external_name
CREATE POLICY "attendance_logs_insert_anon" ON public.attendance_logs
  FOR INSERT
  WITH CHECK (
    auth.role() = 'anon'
    AND user_id IS NULL
    AND external_name IS NOT NULL
  );

-- Users can update their own active attendance rows (leave-log, heartbeat)
CREATE POLICY "attendance_logs_update_own" ON public.attendance_logs
  FOR UPDATE
  USING (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = user_id
        AND supabase_user_id = auth.uid()
    )
  );
```

### 2. Create `backend/src/lib/supabaseAnonClient.js`

This anon-key client respects RLS (unlike the service-role client). It is available for future client-side Supabase queries but is not used by any route yet.

```js
// Supabase client using the anon (public) key.
// This client respects RLS policies — queries are scoped to the current user's JWT.
// Use this for user-scoped operations that should be governed by RLS.
// For admin operations, use supabaseClient.js (service-role key) instead.
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl    = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase configuration (SUPABASE_URL, SUPABASE_ANON_KEY)');
}

const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

module.exports = supabaseAnon;
```

### 3. Update `backend/db/schema.sql`

Change lines 206–216 from `DISABLE ROW LEVEL SECURITY` to `ENABLE ROW LEVEL SECURITY`:

```sql
-- 13. ENABLE Row Level Security on all base tables
-- Policies are defined in backend/db/rls_policies.sql (WI-804).
ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_batches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_consents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs       ENABLE ROW LEVEL SECURITY;
```

Also update the comment preceding the section to remove the TODO:

```sql
-- 13. ENABLE Row Level Security on all base tables
-- Policies are defined in backend/db/rls_policies.sql (WI-804).
```

And update the header comment (line 6–9) to reflect the new state:

```sql
-- IMPORTANT:
--   * RLS is ENABLED with per-table policies defined in rls_policies.sql (WI-804).
--   * The supabase_user_id column is nullable with NO FK yet.
--     Phase 8 (WI-801) will link it to auth.users.
```

### 4. Update `backend/db/README.md` (optional — add note about RLS migration order)

Add a note about the migration order (not strictly required but helpful):

```
## Migration Order

1. `schema.sql` — Creates tables, enums, triggers, and **enables RLS**.
2. `rls_policies.sql` — Defines per-table RLS policies (WI-804). Must be run after schema.sql.
```

### 5. Verify with curl / Supabase REST API

Start the backend and verify RLS is working via the Supabase REST API (not the Express API, since Express uses pgPool which bypasses RLS):

```bash
# 1. Try to read users table with anon key (no JWT) — should fail (empty or error)
curl -X GET "https://<project>.supabase.co/rest/v1/users" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# Expected: 200 with empty array [] or 401 — no rows returned because RLS blocks anon reads

# 2. Try to read users table with a valid JWT (logged-in user) — should return own row
curl -X GET "https://<project>.supabase.co/rest/v1/users" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VALID_USER_JWT"

# Expected: 200 with one row (the authenticated user's record)

# 3. Try to read mail_messages with a student JWT — should only see own messages
curl -X GET "https://<project>.supabase.co/rest/v1/mail_messages" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $STUDENT_JWT"

# Expected: 200 with only messages where sender_id or receiver_id matches the student

# 4. Try to read meetings with anon key — should fail
curl -X GET "https://<project>.supabase.co/rest/v1/meetings" \
  -H "apikey: $SUPABASE_ANON_KEY"

# Expected: 200 with empty array (no anon read access)
```

### 6. Verify backend API still works

Since the backend uses `pgPool` (superuser connection), the Express API should continue working unchanged:

```bash
# With x-mock-role header (backend still accepts mock)
curl -s http://localhost:5000/api/mail/inbox \
  -H "x-mock-role: STUDENT" \
  -H "x-mock-user-id: <valid-uuid>" \
  | head -20

# Expected: Inbox data is returned (backed by pgPool, bypasses RLS)
```

### 7. Apply the policies to the Supabase database

Connect to the Supabase database and run the policies:

```bash
# Connect via psql or Supabase SQL Editor
# Run backend/db/schema.sql first (if not already applied), then:
psql "$DATABASE_URL" -f backend/db/schema.sql
psql "$DATABASE_URL" -f backend/db/rls_policies.sql
```

Alternatively, paste the contents of `rls_policies.sql` into the Supabase Dashboard SQL Editor and run it there.

---

## Expected Output (File Checklist)

### New Files
- [ ] `backend/db/rls_policies.sql` — All RLS policies for 9 tables, plus `public.is_admin()` helper function
- [ ] `backend/src/lib/supabaseAnonClient.js` — Anon-key Supabase client (RLS-respecting)

### Modified Files
- [ ] `backend/db/schema.sql` — Changed `DISABLE ROW LEVEL SECURITY` to `ENABLE ROW LEVEL SECURITY` for all 9 tables, updated comments
- [ ] `backend/db/README.md` — Added migration order note (optional)

---

## Acceptance Criteria

1. All 9 tables have RLS enabled with granular SELECT/INSERT/UPDATE/DELETE policies.
2. Unauthenticated (anon) requests to the Supabase REST API return empty arrays or errors for all tables.
3. Authenticated users can only read their own records on `users`, `student_batches`, `mail_messages`, `meeting_participants`, `meeting_consents`, and `attendance_logs`.
4. Admins (identified via `public.users.role = 'ADMIN'`) can read all rows on all tables.
5. Students cannot read mailbox messages where they are neither sender nor receiver.
6. Students can only see settings for their own batch (via `student_batches`).
7. Students can only see meetings that are public, in their batch, or created by them.
8. Anonymous inserts are allowed on `meeting_participants`, `meeting_consents`, and `attendance_logs` only when `user_id IS NULL` and `external_name IS NOT NULL`.
9. The `public.is_admin()` helper function correctly identifies admin users via `auth.uid()` → `public.users.supabase_user_id`.
10. Backend Express API continues to work unchanged (pgPool and service-role client bypass RLS).
11. The `supabaseAnonClient.js` file is created with the anon key (not the service-role key).

---

## Risk / Impact

- **Non-breaking for backend**: `pgPool` connects as the database owner (superuser), so all existing Express routes continue to work. RLS policies **do not apply** to superuser connections.
- **Non-breaking for backend service-role client**: `supabaseClient.js` uses the service-role key, which bypasses RLS. No changes needed.
- **New `SUPABASE_ANON_KEY` env var**: The new `supabaseAnonClient.js` requires `SUPABASE_ANON_KEY` in the environment. Add it to `.env` and Render dashboard. This key is safe to expose in client-side code (it's the public anon key).
- **`public.is_admin()` function**: Created with `SECURITY DEFINER` so it runs with the privileges of the function owner (superuser), allowing it to query `public.users` even when the current user has no SELECT rights on that table. This is intentional — it's a controlled escalation point for role checks.
- **The `is_admin()` function is used in many policies**: If it ever returns incorrect results, all admin policies will be broken. Test it thoroughly.
- **Anonymous INSERT policies**: The `meeting_participants_insert_anon`, `meeting_consents_insert_anon`, and `attendance_logs_insert_anon` policies allow unauthenticated inserts. This is required for the `?externalName=` flow. However, this means anyone with the Supabase anon key could insert arbitrary `meeting_participants` rows (with `user_id NULL`). This is an accepted risk for the free-tier MVP — the data is low-sensitivity (participant names are self-reported). If needed, a CAPTCHA or rate-limiter can be added later.
- **No DELETE policies for most tables**: Only admins can delete via the service-role client. Regular users and anon users have no DELETE privileges through RLS.
- **`mail_messages` UPDATE policy**: Only allows updating the `is_read`/`read_at` fields. The backend's `pgPool` bypasses this, but direct Supabase REST UPDATE calls would fail for any other column change.

---

## Post-Implementation Steps (MANDATORY)

Once the file checklist and acceptance criteria are satisfied:

### 1. Update `PROGRESS.md`
- Change the status of **WI-804** from `Not Started` to `Done`.
- Set the assignee to `Antigravity`.
- Set the target date to the current date.
- Increment the `Done` and `Completion %` columns in the Phase 8 progress table.

### 2. Update `CHANGELOG.md`
Add a new entry at the top:

```
## [YYYY-MM-DD] - WI-804: Supabase Row Level Security (RLS) Policies
* **Work Item ID**: WI-804
* **Summary**: Added RLS policies to all 9 database tables for defense-in-depth security. Created rls_policies.sql with granular SELECT/INSERT/UPDATE/DELETE policies per role. Changed schema.sql from DISABLE to ENABLE ROW LEVEL SECURITY. Created supabaseAnonClient.js for RLS-respecting anon-key queries. Backend continues to use pgPool (superuser) and service-role key, both of which bypass RLS — no backend logic changes.
* **Files Affected**:
  - [NEW] `backend/db/rls_policies.sql` (full RLS policy set for 9 tables)
  - [NEW] `backend/src/lib/supabaseAnonClient.js` (anon-key Supabase client)
  - [MODIFIED] `backend/db/schema.sql` (DISABLE → ENABLE RLS, updated comments)
  - [MODIFIED] `backend/db/README.md` (migration order note)
* **Verification Done**:
  - [x] Anon key Supabase REST queries return empty/error for all tables
  - [x] Authenticated JWT queries scoped to own records
  - [x] Admin JWT can read all rows (via is_admin() helper)
  - [x] mail_messages: students only see own sent/received
  - [x] batch_settings: students only see own batch settings
  - [x] meetings: students only see public/own-batch/own-created
  - [x] Anonymous INSERT allowed on meeting_participants, meeting_consents, attendance_logs
  - [x] Backend Express API still works (pgPool + service-role bypass RLS)
* **Impact on Existing Functionality**: None — backend continues to use superuser pgPool and service-role Supabase client. RLS only affects direct Supabase REST API calls made with the anon key.
```

### 3. Stop and Wait
Do **not** begin WI-901 in the same session. Wait for the developer to verify and trigger the next prompt.

---

## Notes for the AI Agent

- **RLS is defense-in-depth, not the primary auth layer**: The backend already enforces role-based access via middleware (`requireRole.js`) and JWT validation (WI-802). RLS adds protection against direct Supabase REST API access. Do not remove or modify the middleware role checks — they are the primary authorization layer.
- **`public.is_admin()` uses SECURITY DEFINER**: This is deliberate. The function runs as the owner (superuser) so it can query `public.users` even when the current user has no SELECT rights. Without `SECURITY DEFINER`, the function would fail for non-admin users because the `users` table's RLS policy only allows SELECT on own row.
- **Anonymous INSERT policies are permissive**: The `_insert_anon` policies only check `auth.role() = 'anon'` and the identity constraint (`user_id IS NULL AND external_name IS NOT NULL`). This means anyone with the anon key can insert rows. If abuse becomes a concern, add IP-based rate limiting at the application level (not in RLS).
- **`auth.role()` vs `auth.uid()`**: `auth.role()` returns the JWT role claim (`'authenticated'`, `'anon'`, or `'service_role'`). `auth.uid()` returns the user's ID from the JWT `sub` claim (or NULL for anon). Use `auth.uid()` for identity checks and `auth.role()` for broad category checks.
- **`auth.role() = 'authenticated'` in meeting SELECT policy**: The `meetings_select_accessible` policy checks `auth.role() = 'authenticated'` to ensure only logged-in users can see meetings. Without this check, an anon user could potentially match meetings via the `is_public = true` branch. This prevents meeting enumeration by unauthenticated users.
- **`supabaseClient.js` vs `supabaseAnonClient.js`**: The existing `supabaseClient.js` uses the service-role key (bypasses RLS). The new `supabaseAnonClient.js` uses the anon key (respects RLS). Currently, no route uses the anon client — it's created as infrastructure for future use.
- **Policy naming convention**: `<table>_<operation>_<scope>`. Examples: `users_select_own`, `mail_messages_insert_sender`, `meeting_participants_insert_anon`. This makes it easy to identify what each policy does.
- **Always drop policies before creating**: The file uses `DROP POLICY IF EXISTS` before each `CREATE POLICY` to ensure idempotency. This allows re-running the file without errors.
- **Do not modify route files**: This is a database-security-only work item. Do not touch `backend/src/routes/`, `backend/src/middleware/`, or `backend/src/lib/requireRole.js`. The backend continues to use `pgPool` for all queries, which bypasses RLS.
- **Update `.env.example` or documentation**: If `SUPABASE_ANON_KEY` is not already documented, add it to the environment variable list. The anon key is available in the Supabase Dashboard under Settings → API → Project API keys → `anon public`.
