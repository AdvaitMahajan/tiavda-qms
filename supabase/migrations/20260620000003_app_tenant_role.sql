-- ============================================================================
-- RLS enforcement role. The API connects as `postgres`, which has BYPASSRLS, so
-- org_isolation policies never engage on that role. Per request the API now
-- `SET ROLE app_tenant` — a NOLOGIN, NOBYPASSRLS, non-owner role — so RLS is
-- enforced for all tenant queries. postgres (CREATEROLE) can assume it.
-- service_role (supabaseAdmin: admin/cron/public RPC/storage) is unaffected.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_tenant;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_tenant;

-- Future objects (so new tables/functions are covered automatically).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_tenant;

-- Let the pooled login role (postgres) assume app_tenant per request.
GRANT app_tenant TO postgres;
