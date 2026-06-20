-- ============================================================================
-- Per-org feature flags + plan packaging. The platform owner enables/disables
-- features per client (hard-enforced in the API). Plans are presets; features
-- are the source of truth and can be overridden per org.
--   features: { quotations, payments, site_visits, comms } -> boolean
--   limits:   { max_users } -> int | null(unlimited)
-- ============================================================================

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS limits   jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Existing client keeps everything on (enterprise) so nothing breaks.
UPDATE public.organizations
   SET plan = COALESCE(plan, 'enterprise'),
       features = '{"quotations":true,"payments":true,"site_visits":true,"comms":true}'::jsonb
 WHERE slug = 'global-geotech';

-- Any org missing feature flags defaults to all-on (safe default for pre-existing).
UPDATE public.organizations
   SET features = '{"quotations":true,"payments":true,"site_visits":true,"comms":true}'::jsonb
 WHERE features = '{}'::jsonb;
