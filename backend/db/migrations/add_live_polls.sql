-- Create meeting_polls table
CREATE TABLE IF NOT EXISTS public.meeting_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id),
  creator_name TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create meeting_poll_votes table
CREATE TABLE IF NOT EXISTS public.meeting_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.meeting_polls(id) ON DELETE CASCADE,
  voter_id UUID REFERENCES public.users(id),
  voter_name TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  voted_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT one_vote_per_user_poll UNIQUE NULLS NOT DISTINCT (poll_id, voter_id, voter_name)
);

-- Enable RLS
ALTER TABLE public.meeting_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_poll_votes ENABLE ROW LEVEL SECURITY;

-- Meeting Polls Policies (We allow full access because users interact via supabase realtime from the frontend directly without backend proxy)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can view meeting_polls' AND tablename = 'meeting_polls') THEN
    CREATE POLICY "Public can view meeting_polls" ON public.meeting_polls FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can insert meeting_polls' AND tablename = 'meeting_polls') THEN
    CREATE POLICY "Public can insert meeting_polls" ON public.meeting_polls FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can update meeting_polls' AND tablename = 'meeting_polls') THEN
    CREATE POLICY "Public can update meeting_polls" ON public.meeting_polls FOR UPDATE USING (true);
  END IF;
END $$;

-- Meeting Poll Votes Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can view meeting_poll_votes' AND tablename = 'meeting_poll_votes') THEN
    CREATE POLICY "Public can view meeting_poll_votes" ON public.meeting_poll_votes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can insert meeting_poll_votes' AND tablename = 'meeting_poll_votes') THEN
    CREATE POLICY "Public can insert meeting_poll_votes" ON public.meeting_poll_votes FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Enable Supabase Realtime for both tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_polls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_polls;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'meeting_poll_votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_poll_votes;
  END IF;
END $$;
