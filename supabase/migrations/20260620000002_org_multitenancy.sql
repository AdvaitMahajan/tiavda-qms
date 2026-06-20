-- ============================================================================
-- Phase 2 — org_id multi-tenancy (shared DB + Postgres RLS, pooled)
--
-- Isolation model: every business row carries org_id. The API runs each request
-- with `set_config('app.current_org_id', <uuid>, true)` inside a short
-- transaction; the org_isolation RLS policies (TO public, so they apply to the
-- API's `postgres` pooled role under FORCE RLS) make the database itself filter
-- every SELECT/UPDATE/DELETE and reject cross-org INSERTs. service_role
-- (supabaseAdmin: storage, auth-admin, public RPC proxies, cron) bypasses RLS by
-- design and is responsible for stamping org_id correctly.
--
-- Order: create org tables -> add nullable org_id -> backfill default org ->
-- SET NOT NULL -> per-org uniqueness/sequences -> RLS. Safe to re-run
-- (statement-level idempotent runner skips duplicate-object errors).
-- ============================================================================

-- 1. organizations ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE,
  status      text NOT NULL DEFAULT 'active',   -- active | suspended
  plan        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. profiles: platform-admin flag + org_id (org_id stays NULLABLE — a pure
--    platform admin may belong to no business org) -------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

-- 3. org_integrations: encrypted per-org provider credentials --------------
--    config      = non-secret display config (sender name/email, base url, masked hints)
--    secret_ciphertext = AES-256-GCM ciphertext of the secret JSON (key in Railway env)
CREATE TABLE IF NOT EXISTS public.org_integrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider          text NOT NULL,             -- 'email' | 'whatsapp' | 'drive'
  config            jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  is_active         boolean NOT NULL DEFAULT true,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

-- 4. add org_id (nullable) to every business table -------------------------
ALTER TABLE public.clients                ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.intake_tokens          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.intake_submissions     ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.enquiries              ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.quotations             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.communication_log      ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.follow_ups             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.payments               ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.mobilisation           ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.mob_confirmation_tokens ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.job_completion         ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.job_reminders          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.notifications          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.enquiry_events         ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.rate_matrix            ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.site_visits            ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.app_settings           ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

-- 5. seed the default org + backfill all existing rows ---------------------
DO $backfill$
DECLARE default_org uuid;
BEGIN
  SELECT id INTO default_org FROM public.organizations WHERE slug = 'global-geotech';
  IF default_org IS NULL THEN
    INSERT INTO public.organizations (name, slug)
    VALUES ('Global Geotechnical Consultancy', 'global-geotech')
    RETURNING id INTO default_org;
  END IF;

  UPDATE public.profiles                SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.clients                 SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.intake_tokens           SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.intake_submissions      SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.enquiries               SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.quotations              SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.communication_log       SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.follow_ups              SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.payments                SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.mobilisation            SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.mob_confirmation_tokens SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.job_completion          SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.job_reminders           SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.notifications           SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.enquiry_events          SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.rate_matrix             SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.site_visits             SET org_id = default_org WHERE org_id IS NULL;
  UPDATE public.app_settings            SET org_id = default_org WHERE org_id IS NULL;

  -- existing super_admin(s) become platform admins (the owner) AND belong to the default org
  UPDATE public.profiles SET is_platform_admin = true WHERE role = 'super_admin';
END
$backfill$;

-- 6. enforce NOT NULL on business tables (backfill above guarantees no NULLs)
ALTER TABLE public.clients                ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.intake_tokens          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.intake_submissions     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.enquiries              ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.quotations             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.communication_log      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.follow_ups             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.payments               ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.mobilisation           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.mob_confirmation_tokens ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.job_completion         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.job_reminders          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.notifications          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.enquiry_events         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.rate_matrix            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.site_visits            ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.app_settings           ALTER COLUMN org_id SET NOT NULL;

-- 7. per-org uniqueness & sequences ----------------------------------------
-- app_settings: PK (key) -> (org_id, key) so each org has its own settings
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD PRIMARY KEY (org_id, key);

-- enquiries ref_number: global UNIQUE -> per-org unique
ALTER TABLE public.enquiries DROP CONSTRAINT IF EXISTS enquiries_ref_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_org_ref ON public.enquiries (org_id, ref_number);

-- quotations number: global -> per-org
DROP INDEX IF EXISTS public.idx_quotations_number_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_number_unique
  ON public.quotations (org_id, quotation_number)
  WHERE quotation_number IS NOT NULL AND quotation_number <> '';

-- rate_matrix: one active rate per combo -> per-org
DROP INDEX IF EXISTS public.idx_rate_matrix_unique_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_matrix_unique_active
  ON public.rate_matrix (org_id, city, structure_type, soil_type)
  WHERE is_active = true;

-- ref number generator: sequence per org per year (NEW.org_id set on insert)
CREATE OR REPLACE FUNCTION public.generate_ref_number()
RETURNS TRIGGER AS $$
DECLARE current_year TEXT; next_seq INT;
BEGIN
  IF NEW.ref_number IS NOT NULL AND NEW.ref_number != '' THEN RETURN NEW; END IF;
  current_year := to_char(now(), 'YYYY');
  SELECT coalesce(max(
    nullif(substring(ref_number from 'TIV-' || current_year || '-(\d+)')::int, 0)
  ), 0) + 1
  INTO next_seq
  FROM public.enquiries
  WHERE org_id = NEW.org_id AND ref_number LIKE 'TIV-' || current_year || '-%';
  NEW.ref_number := 'TIV-' || current_year || '-' || lpad(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- quotation number generator: sequence per org per year
CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS TRIGGER AS $$
DECLARE current_year text; next_seq int;
BEGIN
  current_year := to_char(now(), 'YYYY');
  SELECT coalesce(max(
    nullif(substring(quotation_number from 'QTN-' || current_year || '-(\d+)')::int, 0)
  ), 0) + 1
  INTO next_seq
  FROM public.quotations
  WHERE org_id = NEW.org_id AND quotation_number LIKE 'QTN-' || current_year || '-%';
  NEW.quotation_number := 'QTN-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. org_id indexes (query performance) ------------------------------------
CREATE INDEX IF NOT EXISTS idx_clients_org              ON public.clients(org_id);
CREATE INDEX IF NOT EXISTS idx_intake_tokens_org        ON public.intake_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_intake_submissions_org   ON public.intake_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_org            ON public.enquiries(org_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org           ON public.quotations(org_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_org    ON public.communication_log(org_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_org           ON public.follow_ups(org_id);
CREATE INDEX IF NOT EXISTS idx_payments_org             ON public.payments(org_id);
CREATE INDEX IF NOT EXISTS idx_mobilisation_org         ON public.mobilisation(org_id);
CREATE INDEX IF NOT EXISTS idx_mob_conf_tokens_org      ON public.mob_confirmation_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_job_completion_org       ON public.job_completion(org_id);
CREATE INDEX IF NOT EXISTS idx_job_reminders_org        ON public.job_reminders(org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org        ON public.notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_enquiry_events_org       ON public.enquiry_events(org_id);
CREATE INDEX IF NOT EXISTS idx_rate_matrix_org          ON public.rate_matrix(org_id);
CREATE INDEX IF NOT EXISTS idx_site_visits_org          ON public.site_visits(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org             ON public.profiles(org_id);

-- 9. RLS: org_isolation on every business table ----------------------------
-- Policies are TO public (no role clause) so they govern the API's `postgres`
-- pooled role under FORCE. Unset GUC -> current_setting(...,true) is NULL ->
-- org_id = NULL -> no rows (fail-closed).

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.clients;
CREATE POLICY org_isolation ON public.clients
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.intake_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.intake_tokens;
CREATE POLICY org_isolation ON public.intake_tokens
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.intake_submissions;
CREATE POLICY org_isolation ON public.intake_submissions
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.enquiries;
CREATE POLICY org_isolation ON public.enquiries
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.quotations;
CREATE POLICY org_isolation ON public.quotations
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.communication_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.communication_log;
CREATE POLICY org_isolation ON public.communication_log
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.follow_ups;
CREATE POLICY org_isolation ON public.follow_ups
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.payments;
CREATE POLICY org_isolation ON public.payments
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.mobilisation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobilisation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.mobilisation;
CREATE POLICY org_isolation ON public.mobilisation
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.mob_confirmation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mob_confirmation_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.mob_confirmation_tokens;
CREATE POLICY org_isolation ON public.mob_confirmation_tokens
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.job_completion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_completion FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.job_completion;
CREATE POLICY org_isolation ON public.job_completion
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.job_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_reminders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.job_reminders;
CREATE POLICY org_isolation ON public.job_reminders
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.notifications;
CREATE POLICY org_isolation ON public.notifications
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.enquiry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.enquiry_events;
CREATE POLICY org_isolation ON public.enquiry_events
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.rate_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_matrix FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.rate_matrix;
CREATE POLICY org_isolation ON public.rate_matrix
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.site_visits;
CREATE POLICY org_isolation ON public.site_visits
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.app_settings;
CREATE POLICY org_isolation ON public.app_settings
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

-- 10. RLS on org tables (platform-admin aware) -----------------------------
-- organizations: platform admin sees/writes all; an org user may read only their own org row.
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_self_or_platform ON public.organizations;
CREATE POLICY org_self_or_platform ON public.organizations
  USING (
    current_setting('app.platform_admin', true) = 'true'
    OR id = current_setting('app.current_org_id', true)::uuid
  )
  WITH CHECK (current_setting('app.platform_admin', true) = 'true');

-- profiles: org users manage their own org's members; platform admin manages all.
-- (The auth middleware resolves the caller's own profile via service_role, so this
--  policy does not create a chicken-and-egg on login.)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_org_or_platform ON public.profiles;
CREATE POLICY profiles_org_or_platform ON public.profiles
  USING (
    current_setting('app.platform_admin', true) = 'true'
    OR org_id = current_setting('app.current_org_id', true)::uuid
  )
  WITH CHECK (
    current_setting('app.platform_admin', true) = 'true'
    OR org_id = current_setting('app.current_org_id', true)::uuid
  );

-- org_integrations: platform admin provisions (write); org context may read (send path).
ALTER TABLE public.org_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_integrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_integrations_access ON public.org_integrations;
CREATE POLICY org_integrations_access ON public.org_integrations
  USING (
    current_setting('app.platform_admin', true) = 'true'
    OR org_id = current_setting('app.current_org_id', true)::uuid
  )
  WITH CHECK (current_setting('app.platform_admin', true) = 'true');

-- 11. Public/token RPCs become org-aware + SECURITY INVOKER --------------------
-- These are now called ONLY by the API via the service_role client (BYPASSRLS),
-- so INVOKER lets them operate across the token's org without tripping FORCE RLS
-- (a SECURITY DEFINER owned by postgres would be blocked by FORCE). Each stamps
-- org_id (derived from the token/enquiry) and scopes admin/lead lookups by org.

-- submit_intake_form: stamp org_id (from the token) on the submission + new enquiry.
CREATE OR REPLACE FUNCTION public.submit_intake_form(
  p_token text, p_site_address text, p_site_city text, p_site_state text,
  p_site_pincode text, p_structure_type structure_type, p_num_floors integer,
  p_basement_floors integer, p_num_bores integer, p_expected_depth_m numeric,
  p_soil_type_hint soil_type, p_remarks text, p_extended jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn_submit_intake$
DECLARE
  v_token_row intake_tokens%ROWTYPE;
  v_submission_id UUID;
  v_enquiry_id UUID;
  v_ref_number TEXT;
  v_existing_enquiry_id UUID;
BEGIN
  SELECT * INTO v_token_row FROM intake_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('error', 'TOKEN_NOT_FOUND'); END IF;
  IF v_token_row.status = 'used' THEN RETURN json_build_object('error', 'TOKEN_USED'); END IF;
  IF v_token_row.status = 'expired' OR v_token_row.expires_at < NOW() THEN
    RETURN json_build_object('error', 'TOKEN_EXPIRED');
  END IF;

  INSERT INTO intake_submissions (
    org_id, token_id, client_id, site_address, site_city, site_state, site_pincode,
    structure_type, num_floors, basement_floors, num_bores,
    expected_depth_m, soil_type_hint, remarks
  ) VALUES (
    v_token_row.org_id, v_token_row.id, v_token_row.client_id, p_site_address, p_site_city,
    p_site_state, p_site_pincode, p_structure_type, p_num_floors,
    p_basement_floors, p_num_bores, p_expected_depth_m, p_soil_type_hint, p_remarks
  ) RETURNING id INTO v_submission_id;

  UPDATE intake_tokens SET status = 'used', used_at = NOW() WHERE id = v_token_row.id;

  IF v_token_row.enquiry_id IS NOT NULL THEN
    SELECT id INTO v_existing_enquiry_id
    FROM enquiries WHERE id = v_token_row.enquiry_id AND deleted_at IS NULL;
  END IF;

  IF v_existing_enquiry_id IS NULL THEN
    SELECT id INTO v_existing_enquiry_id
    FROM enquiries
    WHERE client_id = v_token_row.client_id
      AND status IN ('new', 'intake_pending')
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_existing_enquiry_id IS NOT NULL THEN
    UPDATE enquiries SET
      submission_id = v_submission_id, site_city = p_site_city, site_address = p_site_address,
      structure_type = p_structure_type, num_bores = p_num_bores, expected_depth_m = p_expected_depth_m,
      soil_type_hint = p_soil_type_hint, remarks = p_remarks, status = 'pending', updated_at = NOW()
    WHERE id = v_existing_enquiry_id
    RETURNING id, ref_number INTO v_enquiry_id, v_ref_number;
  ELSE
    INSERT INTO enquiries (
      org_id, client_id, submission_id, site_city, site_address, structure_type,
      num_bores, expected_depth_m, soil_type_hint, remarks, status
    ) VALUES (
      v_token_row.org_id, v_token_row.client_id, v_submission_id, p_site_city, p_site_address,
      p_structure_type, p_num_bores, p_expected_depth_m, p_soil_type_hint, p_remarks, 'pending'
    ) RETURNING id, ref_number INTO v_enquiry_id, v_ref_number;
  END IF;

  IF p_extended IS NOT NULL AND p_extended <> '{}'::jsonb THEN
    UPDATE enquiries SET
      gst_number             = nullif(p_extended->>'gst_number', ''),
      contact_person         = nullif(p_extended->>'contact_person', ''),
      site_access            = nullif(p_extended->>'site_access', ''),
      site_access_types      = CASE WHEN p_extended ? 'site_access_types' THEN p_extended->'site_access_types' ELSE NULL END,
      water_available        = (p_extended->>'water_available')::boolean,
      water_quantity         = nullif(p_extended->>'water_quantity', ''),
      electricity_available  = (p_extended->>'electricity_available')::boolean,
      security_available     = (p_extended->>'security_arrangement')::boolean,
      plot_fenced            = nullif(p_extended->>'plot_fenced', ''),
      permissions_obtained   = (p_extended->>'permissions_obtained')::boolean,
      safety_required        = (p_extended->>'safety_required')::boolean,
      safety_requirements    = nullif(p_extended->>'safety_requirements', ''),
      demobilization_consent = (p_extended->>'demobilization_consent')::boolean,
      distance_km            = (p_extended->>'distance_km')::numeric,
      soil_fraction          = (p_extended->>'soil_fraction')::numeric,
      google_maps_url        = nullif(p_extended->>'google_maps_url', ''),
      latitude               = (p_extended->>'latitude')::numeric,
      longitude              = (p_extended->>'longitude')::numeric,
      height_of_basements    = (p_extended->>'height_of_basements')::numeric,
      num_podiums            = (p_extended->>'num_podiums')::integer,
      architect_name         = nullif(p_extended->>'architect_name', ''),
      architect_phone        = nullif(p_extended->>'architect_phone', ''),
      architect_address      = nullif(p_extended->>'architect_address', ''),
      rcc_consultant_name    = nullif(p_extended->>'rcc_consultant_name', ''),
      rcc_consultant_phone   = nullif(p_extended->>'rcc_consultant_phone', ''),
      rcc_consultant_address = nullif(p_extended->>'rcc_consultant_address', '')
    WHERE id = v_enquiry_id;
  END IF;

  RETURN json_build_object('success', true, 'submission_id', v_submission_id,
    'enquiry_id', v_enquiry_id, 'ref_number', v_ref_number);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$fn_submit_intake$;

-- notify_admin_intake: notify only the enquiry's-org admins, stamp org_id.
CREATE OR REPLACE FUNCTION public.notify_admin_intake(
  p_city text, p_client_name text, p_enquiry_id text, p_ref_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn_notify_admin$
DECLARE v_admin_id UUID; v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM public.enquiries WHERE id = p_enquiry_id::uuid;
  IF v_org IS NULL THEN RETURN; END IF;
  FOR v_admin_id IN
    SELECT id FROM public.profiles
    WHERE role IN ('super_admin', 'admin') AND is_active = true AND org_id = v_org
  LOOP
    INSERT INTO public.notifications (org_id, user_id, enquiry_id, type, title, body, link)
    VALUES (v_org, v_admin_id, p_enquiry_id::uuid, 'intake_submitted', 'New Intake Submission',
      p_client_name || ' submitted intake for ' || p_city || ' (' || p_ref_number || ')',
      '/enquiries/' || p_enquiry_id);
  END LOOP;
END;
$fn_notify_admin$;

-- attach_intake_files / flag_contact_channel_invalid: updates only → just INVOKER.
ALTER FUNCTION public.attach_intake_files(uuid, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.flag_contact_channel_invalid(uuid, text) SECURITY INVOKER;

-- get_site_visit / get_mob_confirmation: reads only → just INVOKER.
ALTER FUNCTION public.get_site_visit(text) SECURITY INVOKER;
ALTER FUNCTION public.get_mob_confirmation(text) SECURITY INVOKER;

-- submit_site_visit: INVOKER + stamp org_id on the audit event.
CREATE OR REPLACE FUNCTION public.submit_site_visit(
  p_token TEXT, p_feasibility TEXT,
  p_water BOOLEAN, p_access BOOLEAN, p_security BOOLEAN, p_fencing BOOLEAN,
  p_observations TEXT, p_recommendations TEXT, p_cost_factors JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn_submit_sv$
DECLARE v public.site_visits;
BEGIN
  SELECT * INTO v FROM public.site_visits WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_token'); END IF;
  IF v.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_' || v.status);
  END IF;
  UPDATE public.site_visits SET
    status = 'completed', feasibility = p_feasibility,
    water_confirmed = p_water, access_confirmed = p_access,
    security_confirmed = p_security, fencing_confirmed = p_fencing,
    observations = jsonb_build_object('notes', p_observations),
    recommendations = p_recommendations, cost_factors = p_cost_factors, updated_at = now()
  WHERE id = v.id;
  INSERT INTO public.enquiry_events (org_id, enquiry_id, event_type, metadata)
    VALUES (v.org_id, v.enquiry_id, 'site_visit_completed',
            jsonb_build_object('feasibility', p_feasibility, 'visit_id', v.id, 'submitted_via', 'public_form'));
  RETURN jsonb_build_object('ok', true);
END;
$fn_submit_sv$;

-- confirm_mobilisation: INVOKER + org_id on event/notifications + org-scoped leads.
CREATE OR REPLACE FUNCTION public.confirm_mobilisation(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn_confirm_mob$
DECLARE v_tok public.mob_confirmation_tokens; v_ref TEXT; v_lead RECORD;
BEGIN
  SELECT * INTO v_tok FROM public.mob_confirmation_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_token'); END IF;
  IF v_tok.status <> 'pending' THEN RETURN jsonb_build_object('ok', true, 'status', v_tok.status); END IF;
  IF v_tok.expires_at < now() THEN
    UPDATE public.mob_confirmation_tokens SET status = 'expired' WHERE id = v_tok.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.mob_confirmation_tokens SET status = 'confirmed', confirmed_at = now() WHERE id = v_tok.id;
  UPDATE public.mobilisation SET client_confirmed = true, client_confirmed_at = now(), updated_at = now()
    WHERE id = v_tok.mobilisation_id;

  INSERT INTO public.enquiry_events (org_id, enquiry_id, event_type, metadata)
    VALUES (v_tok.org_id, v_tok.enquiry_id, 'mobilisation_confirmed',
            jsonb_build_object('confirmed_by', 'client', 'method', 'public_page'));

  SELECT ref_number INTO v_ref FROM public.enquiries WHERE id = v_tok.enquiry_id;

  FOR v_lead IN
    SELECT DISTINCT uid FROM (
      SELECT id AS uid FROM public.profiles WHERE role = 'mobilization_lead' AND is_active AND org_id = v_tok.org_id
      UNION
      SELECT team_lead_id AS uid FROM public.mobilisation WHERE id = v_tok.mobilisation_id AND team_lead_id IS NOT NULL
    ) s WHERE uid IS NOT NULL
  LOOP
    INSERT INTO public.notifications (org_id, user_id, type, title, body, enquiry_id, link)
    VALUES (v_tok.org_id, v_lead.uid, 'mobilization_confirmed',
            'Mobilisation Confirmed — ' || coalesce(v_ref, ''),
            'Client confirmed the mobilisation date.', v_tok.enquiry_id, '/enquiries/' || v_tok.enquiry_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END;
$fn_confirm_mob$;

-- propose_alternate_mobilisation: INVOKER + org_id + org-scoped leads.
CREATE OR REPLACE FUNCTION public.propose_alternate_mobilisation(p_token TEXT, p_date DATE, p_notes TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $fn_propose_alt$
DECLARE v_tok public.mob_confirmation_tokens; v_ref TEXT; v_orig DATE; v_lead RECORD;
BEGIN
  SELECT * INTO v_tok FROM public.mob_confirmation_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_token'); END IF;
  IF v_tok.status NOT IN ('pending', 'alternate_proposed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_' || v_tok.status);
  END IF;

  UPDATE public.mob_confirmation_tokens
    SET status = 'alternate_proposed', alternate_date = p_date, alternate_notes = p_notes WHERE id = v_tok.id;

  INSERT INTO public.enquiry_events (org_id, enquiry_id, event_type, metadata)
    VALUES (v_tok.org_id, v_tok.enquiry_id, 'mobilisation_alternate_proposed',
            jsonb_build_object('alternate_date', p_date, 'notes', p_notes));

  SELECT ref_number INTO v_ref FROM public.enquiries WHERE id = v_tok.enquiry_id;
  SELECT mobilisation_date INTO v_orig FROM public.mobilisation WHERE id = v_tok.mobilisation_id;

  FOR v_lead IN
    SELECT id AS uid FROM public.profiles WHERE role = 'mobilization_lead' AND is_active AND org_id = v_tok.org_id
  LOOP
    INSERT INTO public.notifications (org_id, user_id, type, title, body, enquiry_id, link)
    VALUES (v_tok.org_id, v_lead.uid, 'mobilization_alternate',
            'Alternate Date Proposed — ' || coalesce(v_ref, ''),
            'Client proposed ' || p_date || ' instead of ' || coalesce(v_orig::text, '') ||
              coalesce('. Reason: ' || nullif(p_notes, ''), ''),
            v_tok.enquiry_id, '/enquiries/' || v_tok.enquiry_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'alternate_proposed');
END;
$fn_propose_alt$;

-- Ensure the service_role (the only caller now) can execute them.
GRANT EXECUTE ON FUNCTION public.submit_intake_form(text, text, text, text, text, structure_type, integer, integer, integer, numeric, soil_type, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_admin_intake(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_site_visit(text, text, boolean, boolean, boolean, boolean, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_site_visit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_mob_confirmation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_mobilisation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.propose_alternate_mobilisation(text, date, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_intake_files(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_contact_channel_invalid(uuid, text) TO service_role;
