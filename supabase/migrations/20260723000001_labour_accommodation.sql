-- ─────────────────────────────────────────────────────────────────────────────
-- Labour accommodation capture on the intake form.
--
-- Two linked site-facility questions, alongside water/electricity/security:
--   1. Is space available on site for labour accommodation?
--   2. If yes, has permission been confirmed for it?
-- Stored as typed booleans on enquiries (nullable = "not answered"), mapped from
-- the intake form's p_extended payload like the other facility answers.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS labour_accommodation_available  boolean,
  ADD COLUMN IF NOT EXISTS labour_accommodation_permission boolean;

COMMENT ON COLUMN public.enquiries.labour_accommodation_available IS
  'Intake: is space available on site for labour accommodation?';
COMMENT ON COLUMN public.enquiries.labour_accommodation_permission IS
  'Intake: if space is available, is permission for labour accommodation confirmed? NULL when space is unavailable/unanswered.';

-- Re-declare submit_intake_form with the two new p_extended mappings appended.
-- Body is otherwise identical to 20260620000002_org_multitenancy.sql.
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
      rcc_consultant_address = nullif(p_extended->>'rcc_consultant_address', ''),
      labour_accommodation_available  = (p_extended->>'labour_accommodation_available')::boolean,
      labour_accommodation_permission = (p_extended->>'labour_accommodation_permission')::boolean
    WHERE id = v_enquiry_id;
  END IF;

  RETURN json_build_object('success', true, 'submission_id', v_submission_id,
    'enquiry_id', v_enquiry_id, 'ref_number', v_ref_number);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$fn_submit_intake$;

GRANT EXECUTE ON FUNCTION public.submit_intake_form(text, text, text, text, text, structure_type, integer, integer, integer, numeric, soil_type, text, jsonb) TO service_role;
