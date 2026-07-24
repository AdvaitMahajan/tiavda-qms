-- =============================================================================
-- Cron configuration via Supabase Vault.
--
-- 20260723000002 documented storing the API base URL + cron secret as database
-- GUCs (ALTER DATABASE ... SET). That is NOT possible on Supabase: setting a
-- custom parameter this way requires superuser, and Supabase's `postgres` role
-- is not one — it fails with "permission denied to set parameter".
--
-- So invoke_api_cron now reads from Supabase Vault (encrypted at rest), keeping
-- the GUC lookup as a fallback for environments where it can be set.
--
-- ── ONE-TIME SETUP (no secrets are committed here) ───────────────────────────
--   select vault.create_secret('https://<your-api-host>/api', 'qms_api_base_url');
--   select vault.create_secret('<CRON_SECRET from Railway>',  'qms_cron_secret');
-- To rotate, update vault.secrets for that name.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault;

CREATE OR REPLACE FUNCTION public.invoke_api_cron(p_path TEXT)
RETURNS void AS $$
DECLARE
  v_base   TEXT;
  v_secret TEXT;
BEGIN
  -- Vault first; ignore any error so a missing/locked vault just falls through.
  BEGIN
    SELECT decrypted_secret INTO v_base
      FROM vault.decrypted_secrets WHERE name = 'qms_api_base_url';
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'qms_cron_secret';
  EXCEPTION WHEN OTHERS THEN
    v_base := NULL; v_secret := NULL;
  END;

  v_base   := coalesce(v_base,   current_setting('app.api_base_url', true));
  v_secret := coalesce(v_secret, current_setting('app.cron_secret',  true));

  IF v_base IS NULL OR v_base = '' OR v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING 'invoke_api_cron: api base url / cron secret not configured — skipping %', p_path;
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
