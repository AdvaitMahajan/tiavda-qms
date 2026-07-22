-- ============================================================================
-- City-based Rate Matrix (returns the "rate matrix" the client asked for, but
-- modelled as an editable grid rather than the old rigid city+structure+soil table).
--
--   rate_matrix_cities  = the COLUMNS (Mumbai, Pune, ... + optional state for fallback)
--   rate_matrix_rows    = the ROWS/activities (Mobilisation, Soil Drilling /m, ...)
--                         rate_key  -> overrides an engine rate (null = custom line item)
--                         basis     -> how qty is derived (lump_sum | per_bore | soil_meters | ...)
--                         applies_to-> si | boq | both
--   rate_matrix_cells   = the VALUES (row x city). NULL = not configured ("TBD").
--
-- Integration: the builder resolves a city's cells into (a) a rate-override map
-- merged over the org's global app_settings rates and (b) extra custom line items.
-- The pricing engines therefore need no knowledge of cities at all.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rate_matrix_cities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  city        text NOT NULL,
  state       text,                      -- enables city -> state fallback matching
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, city)
);

CREATE TABLE IF NOT EXISTS public.rate_matrix_rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label       text NOT NULL,
  rate_key    text,                      -- engine rate key; NULL => custom line item
  basis       text NOT NULL DEFAULT 'lump_sum',
  unit        text,                      -- display unit: LS / per bore / RM ...
  applies_to  text NOT NULL DEFAULT 'both',  -- si | boq | both
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_matrix_cells (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  row_id      uuid NOT NULL REFERENCES public.rate_matrix_rows(id) ON DELETE CASCADE,
  city_id     uuid NOT NULL REFERENCES public.rate_matrix_cities(id) ON DELETE CASCADE,
  value       numeric(12,2),             -- NULL = not configured (TBD)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, row_id, city_id)
);

CREATE INDEX IF NOT EXISTS idx_rm_cities_org ON public.rate_matrix_cities(org_id);
CREATE INDEX IF NOT EXISTS idx_rm_rows_org   ON public.rate_matrix_rows(org_id);
CREATE INDEX IF NOT EXISTS idx_rm_cells_org  ON public.rate_matrix_cells(org_id);
CREATE INDEX IF NOT EXISTS idx_rm_cells_row  ON public.rate_matrix_cells(row_id);
CREATE INDEX IF NOT EXISTS idx_rm_cells_city ON public.rate_matrix_cells(city_id);

-- keep updated_at fresh (set_updated_at already exists in this schema)
DROP TRIGGER IF EXISTS trg_rm_cities_updated ON public.rate_matrix_cities;
CREATE TRIGGER trg_rm_cities_updated BEFORE UPDATE ON public.rate_matrix_cities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_rm_rows_updated ON public.rate_matrix_rows;
CREATE TRIGGER trg_rm_rows_updated BEFORE UPDATE ON public.rate_matrix_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_rm_cells_updated ON public.rate_matrix_cells;
CREATE TRIGGER trg_rm_cells_updated BEFORE UPDATE ON public.rate_matrix_cells
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Tenant isolation (same org_isolation pattern as every other business table) ──
ALTER TABLE public.rate_matrix_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_matrix_cities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.rate_matrix_cities;
CREATE POLICY org_isolation ON public.rate_matrix_cities
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.rate_matrix_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_matrix_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.rate_matrix_rows;
CREATE POLICY org_isolation ON public.rate_matrix_rows
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.rate_matrix_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_matrix_cells FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.rate_matrix_cells;
CREATE POLICY org_isolation ON public.rate_matrix_cells
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_matrix_cities TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_matrix_rows   TO app_tenant;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_matrix_cells  TO app_tenant;

-- ── Seed the client's sheet for the existing org (idempotent) ────────────────
DO $seed$
DECLARE
  v_org uuid;
  v_row_mob uuid; v_row_soil uuid; v_row_rock uuid;
  c record;
  v_mob numeric;
BEGIN
  SELECT id INTO v_org FROM public.organizations WHERE slug = 'global-geotech';
  IF v_org IS NULL THEN RETURN; END IF;
  -- only seed once
  IF EXISTS (SELECT 1 FROM public.rate_matrix_rows WHERE org_id = v_org) THEN RETURN; END IF;

  INSERT INTO public.rate_matrix_cities (org_id, city, state, sort_order) VALUES
    (v_org, 'Mumbai',  'Maharashtra', 1),
    (v_org, 'Pune',    'Maharashtra', 2),
    (v_org, 'Alibaug', 'Maharashtra', 3),
    (v_org, 'Nashik',  'Maharashtra', 4),
    (v_org, 'Goa',     'Goa',         5)
  ON CONFLICT (org_id, city) DO NOTHING;

  INSERT INTO public.rate_matrix_rows (org_id, label, rate_key, basis, unit, applies_to, sort_order)
    VALUES (v_org, 'Mobilisation', 'rate_mobilisation_per_bore', 'lump_sum', 'LS', 'both', 1)
    RETURNING id INTO v_row_mob;
  INSERT INTO public.rate_matrix_rows (org_id, label, rate_key, basis, unit, applies_to, sort_order)
    VALUES (v_org, 'Soil Drilling (per meter)', 'rate_drilling_soil_per_m', 'soil_meters', 'RM', 'both', 2)
    RETURNING id INTO v_row_soil;
  INSERT INTO public.rate_matrix_rows (org_id, label, rate_key, basis, unit, applies_to, sort_order)
    VALUES (v_org, 'Rock Drilling (per meter)', 'rate_drilling_rock_per_m', 'rock_meters', 'RM', 'both', 3)
    RETURNING id INTO v_row_rock;

  FOR c IN SELECT id, city FROM public.rate_matrix_cities WHERE org_id = v_org LOOP
    v_mob := CASE c.city
               WHEN 'Mumbai'  THEN 10000
               WHEN 'Pune'    THEN 10000
               WHEN 'Alibaug' THEN 35000
               WHEN 'Nashik'  THEN 40000
               WHEN 'Goa'     THEN 70000
             END;
    INSERT INTO public.rate_matrix_cells (org_id, row_id, city_id, value)
      VALUES (v_org, v_row_mob, c.id, v_mob) ON CONFLICT DO NOTHING;
    INSERT INTO public.rate_matrix_cells (org_id, row_id, city_id, value)
      VALUES (v_org, v_row_soil, c.id, 1100) ON CONFLICT DO NOTHING;
    INSERT INTO public.rate_matrix_cells (org_id, row_id, city_id, value)
      VALUES (v_org, v_row_rock, c.id, 1300) ON CONFLICT DO NOTHING;
  END LOOP;
END
$seed$;
