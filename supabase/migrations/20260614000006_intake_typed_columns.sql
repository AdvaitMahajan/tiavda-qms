-- =============================================================================
-- H8: Promote the intake "EXTENDED_DATA" JSON blob (previously concatenated into
-- enquiries.remarks) into typed, queryable columns on enquiries.
--
-- Strategy: DUAL-WRITE. The submit RPC keeps storing the blob in remarks (so
-- existing consumers + historical records keep working) AND now also populates
-- these typed columns from a new p_extended jsonb argument. This makes the data
-- queryable/indexable/reportable without a risky big-bang consumer rewrite.
-- =============================================================================

-- 1. Typed columns on enquiries ----------------------------------------------
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS gst_number TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS site_access TEXT,
  ADD COLUMN IF NOT EXISTS site_access_types JSONB,
  ADD COLUMN IF NOT EXISTS water_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS water_quantity TEXT,
  ADD COLUMN IF NOT EXISTS electricity_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS security_available BOOLEAN,
  ADD COLUMN IF NOT EXISTS plot_fenced TEXT,
  ADD COLUMN IF NOT EXISTS permissions_obtained BOOLEAN,
  ADD COLUMN IF NOT EXISTS safety_required BOOLEAN,
  ADD COLUMN IF NOT EXISTS safety_requirements TEXT,
  ADD COLUMN IF NOT EXISTS demobilization_consent BOOLEAN,
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS soil_fraction NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS height_of_basements NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS num_podiums INTEGER,
  ADD COLUMN IF NOT EXISTS architect_name TEXT,
  ADD COLUMN IF NOT EXISTS architect_phone TEXT,
  ADD COLUMN IF NOT EXISTS architect_address TEXT,
  ADD COLUMN IF NOT EXISTS rcc_consultant_name TEXT,
  ADD COLUMN IF NOT EXISTS rcc_consultant_phone TEXT,
  ADD COLUMN IF NOT EXISTS rcc_consultant_address TEXT;

-- Helpful indexes for reporting/queries on the cost-driving fields.
CREATE INDEX IF NOT EXISTS idx_enquiries_water_available ON public.enquiries(water_available);
CREATE INDEX IF NOT EXISTS idx_enquiries_safety_required ON public.enquiries(safety_required);

-- 2. submit_intake_form: add p_extended jsonb + populate typed columns --------
CREATE OR REPLACE FUNCTION public.submit_intake_form(
  p_token text,
  p_site_address text,
  p_site_city text,
  p_site_state text,
  p_site_pincode text,
  p_structure_type structure_type,
  p_num_floors integer,
  p_basement_floors integer,
  p_num_bores integer,
  p_expected_depth_m numeric,
  p_soil_type_hint soil_type,
  p_remarks text,
  p_extended jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_token_row intake_tokens%ROWTYPE;
  v_submission_id UUID;
  v_enquiry_id UUID;
  v_ref_number TEXT;
  v_existing_enquiry_id UUID;
BEGIN
  SELECT * INTO v_token_row FROM intake_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'TOKEN_NOT_FOUND');
  END IF;
  IF v_token_row.status = 'used' THEN
    RETURN json_build_object('error', 'TOKEN_USED');
  END IF;
  IF v_token_row.status = 'expired' OR v_token_row.expires_at < NOW() THEN
    RETURN json_build_object('error', 'TOKEN_EXPIRED');
  END IF;

  INSERT INTO intake_submissions (
    token_id, client_id, site_address, site_city, site_state, site_pincode,
    structure_type, num_floors, basement_floors, num_bores,
    expected_depth_m, soil_type_hint, remarks
  ) VALUES (
    v_token_row.id, v_token_row.client_id, p_site_address, p_site_city,
    p_site_state, p_site_pincode, p_structure_type, p_num_floors,
    p_basement_floors, p_num_bores, p_expected_depth_m, p_soil_type_hint, p_remarks
  ) RETURNING id INTO v_submission_id;

  UPDATE intake_tokens SET status = 'used', used_at = NOW() WHERE id = v_token_row.id;

  SELECT id INTO v_existing_enquiry_id
  FROM enquiries
  WHERE client_id = v_token_row.client_id
    AND status IN ('new', 'intake_pending')
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_enquiry_id IS NOT NULL THEN
    UPDATE enquiries SET
      submission_id = v_submission_id,
      site_city = p_site_city,
      site_address = p_site_address,
      structure_type = p_structure_type,
      num_bores = p_num_bores,
      expected_depth_m = p_expected_depth_m,
      soil_type_hint = p_soil_type_hint,
      remarks = p_remarks,
      status = 'pending',
      updated_at = NOW()
    WHERE id = v_existing_enquiry_id
    RETURNING id, ref_number INTO v_enquiry_id, v_ref_number;
  ELSE
    INSERT INTO enquiries (
      client_id, submission_id, site_city, site_address, structure_type,
      num_bores, expected_depth_m, soil_type_hint, remarks, status
    ) VALUES (
      v_token_row.client_id, v_submission_id, p_site_city, p_site_address,
      p_structure_type, p_num_bores, p_expected_depth_m, p_soil_type_hint, p_remarks, 'pending'
    ) RETURNING id, ref_number INTO v_enquiry_id, v_ref_number;
  END IF;

  -- Populate typed columns from the extended payload (cost-driving + project data)
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

  RETURN json_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'enquiry_id', v_enquiry_id,
    'ref_number', v_ref_number
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$function$;
