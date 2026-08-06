-- Add last_joined_at to attendance_logs to track the start of the current session segment.
-- This enables accurate time accumulation across multiple sessions (e.g. morning + afternoon)
-- in a single row per user per meeting per day.
ALTER TABLE public.attendance_logs ADD COLUMN IF NOT EXISTS last_joined_at timestamptz;
-- Backfill existing rows: treat joined_at as the segment start for existing records
UPDATE public.attendance_logs SET last_joined_at = joined_at WHERE last_joined_at IS NULL;
