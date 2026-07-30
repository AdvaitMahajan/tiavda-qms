-- =============================================================================
-- Repoint the daily + weekly cron at the Railway API (not the legacy edge fns).
--
-- qms-daily-cron / qms-weekly-summary were invoking Supabase Edge Functions
-- (invoke_edge_function), whose code is the OLD port and has NONE of the newer
-- reminder logic (field-work → sample-submission, lab alternate-day, lab delay
-- alert, reminder ack re-nudge). All of that lives in the Railway Express
-- /api/cron/daily (runDaily). So those reminders never fired.
--
-- invoke_api_cron already works (vault secrets qms_api_base_url / qms_cron_secret
-- are set — same path the follow-up digest uses). Repoint both jobs to it.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN PERFORM cron.unschedule('qms-daily-cron');     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('qms-weekly-summary'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 03:30 UTC == 09:00 IST — morning run so reminders land before the workday.
SELECT cron.schedule('qms-daily-cron', '30 3 * * *', $$ SELECT public.invoke_api_cron('/cron/daily'); $$);
-- Mondays 04:00 UTC == 09:30 IST.
SELECT cron.schedule('qms-weekly-summary', '0 4 * * 1', $$ SELECT public.invoke_api_cron('/cron/weekly'); $$);
