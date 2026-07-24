-- =============================================================================
-- Seed the operations team contact directory (from the client's shared sheet).
--
-- Separate migration so the new user_role values added in 20260724000002 are
-- committed before anything references them.
--
-- Email addresses are intentionally NULL — the client is sending them
-- separately. Logins are created later and linked via profile_id; no
-- placeholder addresses are invented here, because those would become real
-- auth identities and password-reset targets.
-- =============================================================================

DO $$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  -- Idempotent: skip if this org already has a directory.
  IF EXISTS (SELECT 1 FROM public.team_members WHERE org_id = v_org) THEN RETURN; END IF;

  INSERT INTO public.team_members
    (org_id, full_name, phone, responsibility, app_role, city, sort_order)
  VALUES
    (v_org, 'Prajact Sarwate',   '+919920952115', 'Execution Head',                    'execution_head', 'Mumbai & Other Locations', 1),
    (v_org, 'Rahul Bhande',      '+918623042222', 'Execution',                         'execution',      'Pune',                     2),
    (v_org, 'Siddhi Gawde',      '+918422834470', 'Contract & Planning',               'planning',       'Mumbai & Other Locations', 3),
    (v_org, 'Priyanka Waghmare', '+918291917576', 'Final Report & Bill Preparation',   'reporting',      'Mumbai & Other Locations', 4),
    (v_org, 'Deepak Gurav',      '+918828829930', 'Accounts (Final Bill & Report Delivery)', 'accounts', 'Mumbai & Other Locations', 5);
END $$;
