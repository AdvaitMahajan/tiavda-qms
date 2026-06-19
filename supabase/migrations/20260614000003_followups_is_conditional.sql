-- =============================================================================
-- C5: Add the is_conditional column that daily-cron already queries but which
-- was never defined. Without it, the server-side Day-15/30 conditional cleanup
-- (daily-cron section ~9) errors / no-ops every run.
-- =============================================================================

ALTER TABLE public.follow_ups
  ADD COLUMN IF NOT EXISTS is_conditional BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing auto-scheduled Day-15/Day-30 rows so the cron cleanup and
-- any historical data are consistent with the new flag.
UPDATE public.follow_ups
  SET is_conditional = true
  WHERE auto_scheduled = true
    AND is_conditional = false
    AND (notes LIKE 'Day 15:%' OR notes LIKE 'Day 30:%');
