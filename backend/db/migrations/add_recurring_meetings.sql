-- Migration: Add recurring meeting support
-- Run this once against your existing Supabase database.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS is_recurring     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recur_start_time time NULL,
  ADD COLUMN IF NOT EXISTS recur_end_time   time NULL;

ALTER TABLE public.meetings
  DROP CONSTRAINT IF EXISTS meetings_recurring_times_chk;

ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_recurring_times_chk CHECK (
    (is_recurring = false) OR
    (is_recurring = true AND recur_start_time IS NOT NULL AND recur_end_time IS NOT NULL AND recur_start_time < recur_end_time)
  );
