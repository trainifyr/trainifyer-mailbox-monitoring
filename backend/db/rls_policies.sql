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
