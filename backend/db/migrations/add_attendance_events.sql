CREATE TABLE IF NOT EXISTS public.attendance_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_log_id uuid NOT NULL REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  event_type        text NOT NULL CHECK (event_type IN ('JOIN', 'LEAVE')),
  event_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_events_log_id ON public.attendance_events(attendance_log_id);
