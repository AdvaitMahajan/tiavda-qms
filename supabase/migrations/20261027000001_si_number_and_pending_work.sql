-- =============================================================================
-- 1. SI number — assigned once, by the API, when an enquiry is marked Won.
--    Format SI-YYYY-NNN per org and year. Never reassigned or reused (deleted
--    enquiries keep theirs); the unique index makes a duplicate impossible.
-- 2. pending_work — quick to-do entries ("call 98765…") shown on the dashboard
--    until marked done. Not linked to clients/enquiries.
--
-- The API applies the same statements at startup (server/src/lib/ensure-schema.ts)
-- since migrations are not run on deploy. All idempotent.
-- =============================================================================

ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS si_number text;
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS si_assigned_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS enquiries_org_si_number_uq
  ON public.enquiries (org_id, si_number) WHERE si_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pending_work (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title      text NOT NULL,
  status     text NOT NULL DEFAULT 'open',   -- open | done
  created_by uuid,
  done_by    uuid,
  done_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_work_org_status_idx ON public.pending_work (org_id, status, created_at DESC);

ALTER TABLE public.pending_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_work FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.pending_work;
CREATE POLICY org_isolation ON public.pending_work
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_work TO app_tenant;
