-- =============================================================================
-- Field Work Completion + sample submission (#7) and Lab processing (#8).
--
-- New stage/columns on job_completion, ahead of the existing Site Completion:
--   Field Work Completion (Execution Team sets the date) →
--   Samples submitted to lab (Site Supervisor) →
--   Lab processing (Lab Team, 4-day window).
-- The reminder cadences (3 daily / alternate-day) are computed from these dates
-- by the daily cron; no pre-scheduled rows needed.
-- =============================================================================

ALTER TABLE public.job_completion
  ADD COLUMN IF NOT EXISTS field_work_completion_date date,
  ADD COLUMN IF NOT EXISTS field_work_done            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS field_work_completed_actual timestamptz,
  ADD COLUMN IF NOT EXISTS field_work_notes           text,
  ADD COLUMN IF NOT EXISTS samples_submitted          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS samples_submitted_at       timestamptz,
  ADD COLUMN IF NOT EXISTS samples_submitted_by       uuid,
  ADD COLUMN IF NOT EXISTS lab_assignee_id            uuid,
  ADD COLUMN IF NOT EXISTS lab_due_date               date,
  ADD COLUMN IF NOT EXISTS lab_processing_done        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lab_completed_at           timestamptz;

COMMENT ON COLUMN public.job_completion.field_work_completion_date IS
  'Execution Team: date site field work completed; starts the 3-day sample-submission reminders.';
COMMENT ON COLUMN public.job_completion.lab_due_date IS
  'samples_submitted_at + lab processing days; past this with lab_processing_done=false triggers a delay alert.';
