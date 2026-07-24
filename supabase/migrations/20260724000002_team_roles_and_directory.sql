-- =============================================================================
-- Operations team: real roles + a contact directory.
--
-- 1. Extend user_role with the roles the operations team actually has. Purely
--    ADDITIVE — super_admin/admin keep exactly the permissions they had, so no
--    existing access changes.
-- 2. team_members: the contact directory (name/phone/responsibility/city) so the
--    team exists in the app before their email addresses arrive. Each row can be
--    linked to a real login (profile_id) once the account is created.
-- =============================================================================

-- ── 1. New roles ────────────────────────────────────────────────────────────
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that uses the
-- value; team_members.app_role is plain text precisely to avoid that coupling.
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'execution_head';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'execution';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'planning';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'reporting';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'accounts';

-- ── 2. Team directory ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  phone          text,
  email          text,
  responsibility text,
  app_role       text,
  city           text,
  profile_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.team_members IS 'Operations team contact directory; profile_id links a member to their login once created.';
COMMENT ON COLUMN public.team_members.app_role IS 'user_role this member should receive when their login is created (text to stay decoupled from the enum).';

CREATE INDEX IF NOT EXISTS idx_team_members_org ON public.team_members(org_id);

DO $$
BEGIN
  CREATE TRIGGER set_team_members_updated_at
    BEFORE UPDATE ON public.team_members
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.team_members;
CREATE POLICY org_isolation ON public.team_members
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO app_tenant;
