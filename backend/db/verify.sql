-- =============================================================
-- WI-104: Schema Verification Queries
-- Run these in the Supabase SQL Editor to manually verify the schema.
-- =============================================================

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
