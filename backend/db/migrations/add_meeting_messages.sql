-- Migration: add_meeting_messages
-- 1. Create table
CREATE TABLE IF NOT EXISTS public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL, -- null for anonymous/external
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  -- Cannot use REFERENCES public.users(id) for pinned_by because it can be an external user pinning their own msg. 
  -- We'll store string 'external_name' or UUID string
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_meeting_messages_meeting_id ON public.meeting_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_messages_created_at ON public.meeting_messages(created_at);

-- 3. RLS
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting_messages_select" ON public.meeting_messages;
CREATE POLICY "meeting_messages_select" ON public.meeting_messages
  FOR SELECT USING (true); -- Realtime handles sub authorization. Read everywhere via API if needed.

DROP POLICY IF EXISTS "meeting_messages_insert" ON public.meeting_messages;
CREATE POLICY "meeting_messages_insert" ON public.meeting_messages
  FOR INSERT WITH CHECK (true); -- Public insert for attendees

DROP POLICY IF EXISTS "meeting_messages_update" ON public.meeting_messages;
CREATE POLICY "meeting_messages_update" ON public.meeting_messages
  FOR UPDATE USING (true); -- Anyone can pin their own message (enforce ownership logic in Frontend/Socket or via API instead)

-- 4. Supabase Realtime
-- Add table to publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'meeting_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
  END IF;
END $$;
