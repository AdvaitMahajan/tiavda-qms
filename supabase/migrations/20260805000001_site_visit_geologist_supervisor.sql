-- =============================================================================
-- Site Visit: named Geologist + Supervisor pickers, backed by the Team Directory.
--
-- The client wants specific Geologists (Prajact — Mumbai, Rahul — Pune) and an
-- "Assign Supervisor" list of 10 names selectable on a site visit. These people
-- may not have logins, so they live in team_members (contact directory) flagged
-- as geologist/supervisor, and the site visit stores which member was assigned.
-- =============================================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS is_geologist  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_supervisor boolean NOT NULL DEFAULT false;

ALTER TABLE public.site_visits
  ADD COLUMN IF NOT EXISTS geologist_member_id  uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL;

-- Seed: flag the two geologists (already in the directory) + add the supervisors.
DO $$
DECLARE v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN RETURN; END IF;

  -- Geologists (match on name; they were seeded earlier as ops team members).
  UPDATE public.team_members SET is_geologist = true
   WHERE org_id = v_org AND full_name IN ('Prajact Sarwate', 'Rahul Bhande');

  -- Supervisors — insert any that aren't already present (idempotent by name).
  INSERT INTO public.team_members (org_id, full_name, responsibility, is_supervisor, sort_order)
  SELECT v_org, name, 'Site Supervisor', true, 100 + ord
  FROM (VALUES
    ('Nitin Kamble', 1), ('Kumar Kamble', 2), ('Vimlesh Kumar', 3),
    ('Jagdish Dingankar', 4), ('Prafull Gaikwad', 5), ('Pranit Sonavane', 6),
    ('Sunil Bhavari', 7), ('Manohar Joshi', 8), ('Vikas Kadam', 9),
    ('Aniket Chindarkar', 10)
  ) AS v(name, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.org_id = v_org AND tm.full_name = v.name
  );
END $$;
