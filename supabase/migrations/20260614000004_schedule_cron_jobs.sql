-- =============================================================================
-- C2: Schedule the time-based automation. Without this, daily-cron and
-- weekly-summary are never invoked, so EVERY time-based feature is dead:
-- follow-up/job/payment reminders, auto-inactive, missed-call morning prompt,
-- mobilisation token expiry, intake non-response nudges, weekly summary.
--
-- Uses pg_cron (scheduler) + pg_net (HTTP) to POST to the Edge Functions.
--
-- ── ONE-TIME SETUP REQUIRED (cannot be hardcoded in a committed migration) ──
-- The HTTP call needs the project's Edge Function base URL + the service-role
-- key. Store them once as Postgres settings (run these in the SQL editor with
-- real values, NOT committed here):
--
--   ALTER DATABASE postgres SET app.edge_base_url =
--     'https://yikgnboolunszxtrmbfz.supabase.co/functions/v1';
--   ALTER DATABASE postgres SET app.service_role_key = '<SERVICE_ROLE_KEY>';
--
-- (Or use Supabase Vault and read via vault.decrypted_secrets — see note below.)
-- After setting them, this migration's jobs will pick them up via
-- current_setting(...). Re-run the schedule block if you set them afterwards.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper that invokes an edge function by name using the stored settings.
-- SECURITY DEFINER so only the scheduler (running as the job owner) uses the key.
CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_function TEXT)
RETURNS void AS $$
DECLARE
  v_base  TEXT := current_setting('app.edge_base_url', true);
  v_key   TEXT := current_setting('app.service_role_key', true);
BEGIN
  IF v_base IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'invoke_edge_function: app.edge_base_url / app.service_role_key not set — skipping %', p_function;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_base || '/' || p_function,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Unschedule any prior versions so this migration is idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('qms-daily-cron');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('qms-weekly-summary');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- daily-cron: every day at 03:30 UTC (~09:00 IST) — before the workday starts,
-- so the missed-call morning prompt and Today's Actions are ready on login.
SELECT cron.schedule(
  'qms-daily-cron',
  '30 3 * * *',
  $$ SELECT public.invoke_edge_function('daily-cron'); $$
);

-- weekly-summary: Mondays 04:00 UTC (~09:30 IST).
SELECT cron.schedule(
  'qms-weekly-summary',
  '0 4 * * 1',
  $$ SELECT public.invoke_edge_function('weekly-summary'); $$
);

-- -----------------------------------------------------------------------------
-- NOTE: If pg_cron / pg_net are not available on your Supabase plan, schedule
-- daily-cron and weekly-summary from the Supabase Dashboard
-- (Edge Functions -> Schedules) or an external scheduler (e.g. a GitHub Action
-- POSTing to the function URL with the service-role key) instead. The functions
-- themselves are already implemented and idempotent.
-- -----------------------------------------------------------------------------
