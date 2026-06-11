-- =============================================================
-- WI-104: Base Database Schema
-- Project: Trainifyer Mailbox Monitoring Platform
--
-- IMPORTANT:
--   * RLS is ENABLED with per-table policies defined in rls_policies.sql (WI-804).
--   * The supabase_user_id column is linked to auth.users (WI-801).
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

-- 11. Shared updated_at trigger function
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

-- 12. list_public_tables() RPC (for /api/health/db endpoint)
CREATE OR REPLACE FUNCTION public.list_public_tables()
RETURNS TABLE(tablename text) AS $$
BEGIN
  RETURN QUERY SELECT t.tablename::text
  FROM pg_tables t
  WHERE t.schemaname = 'public'
  ORDER BY t.tablename;
END;
$$ LANGUAGE plpgsql STABLE;

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
