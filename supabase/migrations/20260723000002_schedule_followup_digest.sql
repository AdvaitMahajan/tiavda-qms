-- =============================================================================
-- Schedule the daily follow-up digest at 11:00 IST.
--
-- Posts to the Railway API's cron endpoint (POST /api/cron/followup-digest),
-- which emails one digest per org listing every follow-up due today (plus
-- overdue) with client/company + contact details, to the staff selected in
-- Settings -> "Daily follow-up digest email".
--
-- ── ONE-TIME SETUP REQUIRED (no secrets are committed here) ──────────────────
-- Run once in the Supabase SQL editor with your real values:
--
--   ALTER DATABASE postgres SET app.api_base_url =
--     'https://tiavda-qms-production.up.railway.app/api';
--   ALTER DATABASE postgres SET app.cron_secret = '<CRON_SECRET from Railway>';
--
-- Then re-run this migration (or just the cron.schedule block) so the job picks
-- them up. Until they are set the job runs but no-ops with a warning.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Invoke a Railway API cron route with the shared X-Cron-Secret header.
CREATE OR REPLACE FUNCTION public.invoke_api_cron(p_path TEXT)
RETURNS void AS $$
DECLARE
  v_base   TEXT := current_setting('app.api_base_url', true);
  v_secret TEXT := current_setting('app.cron_secret', true);
BEGIN
  IF v_base IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'invoke_api_cron: app.api_base_url / app.cron_secret not set — skipping %', p_path;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_base || p_path,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'X-Cron-Secret', v_secret
               ),
    body    := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Idempotent: drop any prior version of the job before (re)scheduling.
DO $$
BEGIN
  PERFORM cron.unschedule('qms-followup-digest');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 05:30 UTC == 11:00 IST (Asia/Kolkata, UTC+5:30).
SELECT cron.schedule(
  'qms-followup-digest',
  '30 5 * * *',
  $$ SELECT public.invoke_api_cron('/cron/followup-digest'); $$
);
