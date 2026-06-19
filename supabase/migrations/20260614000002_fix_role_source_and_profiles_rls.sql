-- =============================================================================
-- C3 + C4: Security fix — role source + profiles privilege escalation.
--
-- BEFORE:
--   * get_user_role() read role from JWT user_metadata.role, but the app writes
--     role changes to public.profiles.role → role changes never took effect at
--     the DB layer (RLS enforced a stale/blank role, defaulting to 'viewer').
--   * profiles UPDATE policy was USING(true) WITH CHECK(true) → any authenticated
--     user could self-promote to super_admin via a direct client call.
--
-- AFTER:
--   * get_user_role() reads from public.profiles (the source of truth the app
--     writes), and enforces is_active. Runs SECURITY DEFINER so it bypasses
--     profiles RLS (no recursion).
--   * profiles INSERT/UPDATE restricted to editors (admin/super_admin). Normal
--     users cannot change roles at all. (Account creation goes through the
--     invite-user edge function using the service role, which bypasses RLS;
--     the signup trigger, if any, runs SECURITY DEFINER and also bypasses RLS.)
-- =============================================================================

-- 1. Role now comes from profiles, not the spoofable JWT claim ----------------
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
  SELECT coalesce(
    (SELECT role::text FROM public.profiles
       WHERE id = auth.uid() AND is_active),
    'viewer'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- is_editor() / is_not_viewer() are unchanged in logic but now resolve against
-- the new, authoritative source automatically.

-- 2. Lock down profiles writes -----------------------------------------------
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_editor());

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated USING (public.is_editor()) WITH CHECK (public.is_editor());

-- SELECT stays open to authenticated (team directory, assignee pickers).

-- 3. Status-transition trigger: use the same authoritative role source --------
-- (Previously trusted JWT user_metadata.role for the super_admin bypass.)
CREATE OR REPLACE FUNCTION public.validate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed text[];
  user_role text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NULL THEN
    RETURN NEW;
  END IF;

  user_role := public.get_user_role();

  IF user_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status::text
    WHEN 'new' THEN ARRAY['intake_pending', 'pending', 'lost', 'inactive']
    WHEN 'intake_pending' THEN ARRAY['pending', 'lost', 'inactive']
    WHEN 'pending' THEN ARRAY['sent', 'lost', 'inactive']
    WHEN 'sent' THEN ARRAY['follow_up', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'follow_up' THEN ARRAY['sent', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'negotiation' THEN ARRAY['sent', 'approved', 'lost', 'inactive']
    WHEN 'approved' THEN ARRAY['payment_received', 'lost', 'inactive']
    WHEN 'payment_received' THEN ARRAY['mobilization_scheduled', 'lost', 'inactive']
    WHEN 'mobilization_scheduled' THEN ARRAY['job_active', 'lost', 'inactive']
    WHEN 'job_active' THEN ARRAY['completed', 'lost', 'inactive']
    WHEN 'confirmed' THEN ARRAY['completed', 'lost', 'inactive']
    WHEN 'lost' THEN ARRAY['follow_up']
    WHEN 'inactive' THEN ARRAY['follow_up']
    WHEN 'completed' THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status::text = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid status transition: "%" -> "%". Allowed from "%": %',
      OLD.status, NEW.status, OLD.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
