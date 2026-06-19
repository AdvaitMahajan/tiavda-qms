-- Fix submit_intake_form RPC to update existing enquiry instead of creating duplicate
-- When AddLeadDialog creates an enquiry (status new/intake_pending), the intake form
-- should update that enquiry rather than inserting a new one.

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
  p_remarks text
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
  -- Validate token
  SELECT * INTO v_token_row
  FROM intake_tokens
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'TOKEN_NOT_FOUND');
  END IF;

  IF v_token_row.status = 'used' THEN
    RETURN json_build_object('error', 'TOKEN_USED');
  END IF;

  IF v_token_row.status = 'expired' OR v_token_row.expires_at < NOW() THEN
    RETURN json_build_object('error', 'TOKEN_EXPIRED');
  END IF;

  -- Insert intake submission
  INSERT INTO intake_submissions (
    token_id, client_id, site_address, site_city, site_state, site_pincode,
    structure_type, num_floors, basement_floors, num_bores,
    expected_depth_m, soil_type_hint, remarks
  ) VALUES (
    v_token_row.id, v_token_row.client_id, p_site_address, p_site_city,
    p_site_state, p_site_pincode, p_structure_type, p_num_floors,
    p_basement_floors, p_num_bores, p_expected_depth_m, p_soil_type_hint, p_remarks
  ) RETURNING id INTO v_submission_id;

  -- Mark token as used
  UPDATE intake_tokens
  SET status = 'used', used_at = NOW()
  WHERE id = v_token_row.id;

  -- Check for existing enquiry (created by AddLeadDialog) for this client
  SELECT id INTO v_existing_enquiry_id
  FROM enquiries
  WHERE client_id = v_token_row.client_id
    AND status IN ('new', 'intake_pending')
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_enquiry_id IS NOT NULL THEN
    -- Update existing enquiry with intake form data
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
    -- No existing enquiry — create new one with status pending
    INSERT INTO enquiries (
      client_id, submission_id, site_city, site_address, structure_type,
      num_bores, expected_depth_m, soil_type_hint, remarks, status
    ) VALUES (
      v_token_row.client_id, v_submission_id, p_site_city, p_site_address,
      p_structure_type, p_num_bores, p_expected_depth_m, p_soil_type_hint, p_remarks, 'pending'
    ) RETURNING id, ref_number INTO v_enquiry_id, v_ref_number;
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
