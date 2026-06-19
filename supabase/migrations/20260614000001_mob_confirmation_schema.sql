-- =============================================================================
-- C1: Mobilisation confirmation schema (was created by hand in the dashboard,
-- never version-controlled). This migration makes it reproducible.
-- Idempotent (IF NOT EXISTS) so it can be applied safely to the live DB too.
--
-- It also moves the PUBLIC confirmation flow off direct anon table writes and
-- onto SECURITY DEFINER RPCs, so we do NOT have to grant anon UPDATE on the
-- mobilisation table (which would be a privilege-escalation hole).
-- =============================================================================

-- 1. Confirmation token table -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mob_confirmation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mobilisation_id UUID NOT NULL REFERENCES public.mobilisation(id) ON DELETE CASCADE,
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | confirmed | alternate_proposed | expired
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  alternate_date DATE,
  alternate_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mob_tokens_token ON public.mob_confirmation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_mob_tokens_mob ON public.mob_confirmation_tokens(mobilisation_id);

-- 2. Mobilisation confirmation columns ---------------------------------------
ALTER TABLE public.mobilisation
  ADD COLUMN IF NOT EXISTS client_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_override_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_override_at TIMESTAMPTZ;

-- 3. RLS — staff (authenticated, non-viewer) manage tokens; NO anon table grant
ALTER TABLE public.mob_confirmation_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mob_tokens_select" ON public.mob_confirmation_tokens;
CREATE POLICY "mob_tokens_select" ON public.mob_confirmation_tokens
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "mob_tokens_insert" ON public.mob_confirmation_tokens;
CREATE POLICY "mob_tokens_insert" ON public.mob_confirmation_tokens
  FOR INSERT TO authenticated WITH CHECK (public.is_not_viewer());

DROP POLICY IF EXISTS "mob_tokens_update" ON public.mob_confirmation_tokens;
CREATE POLICY "mob_tokens_update" ON public.mob_confirmation_tokens
  FOR UPDATE TO authenticated USING (public.is_not_viewer()) WITH CHECK (public.is_not_viewer());

-- =============================================================================
-- 4. PUBLIC RPCs (SECURITY DEFINER) for the client-facing confirmation page.
--    Anon gets EXECUTE on these only — never direct table access.
-- =============================================================================

-- 4a. Fetch the details shown on the confirmation page
CREATE OR REPLACE FUNCTION public.get_mob_confirmation(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_tok public.mob_confirmation_tokens;
  v_result JSONB;
BEGIN
  SELECT * INTO v_tok FROM public.mob_confirmation_tokens WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', v_tok.id,
    'mobilisation_id', v_tok.mobilisation_id,
    'enquiry_id', v_tok.enquiry_id,
    'status', v_tok.status,
    'expires_at', v_tok.expires_at,
    'alternate_date', v_tok.alternate_date,
    'mobilisation', (SELECT jsonb_build_object(
        'mobilisation_date', m.mobilisation_date,
        'mobilisation_time', m.mobilisation_time,
        'site_contact_name', m.site_contact_name)
      FROM public.mobilisation m WHERE m.id = v_tok.mobilisation_id),
    'enquiry', (SELECT jsonb_build_object(
        'ref_number', e.ref_number,
        'site_city', e.site_city,
        'site_address', e.site_address)
      FROM public.enquiries e WHERE e.id = v_tok.enquiry_id),
    'client', (SELECT jsonb_build_object('name', c.name)
      FROM public.clients c WHERE c.id = v_tok.client_id)
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4b. Confirm the mobilisation date (also notifies the team — closes gap H5)
CREATE OR REPLACE FUNCTION public.confirm_mobilisation(p_token TEXT)
RETURNS JSONB AS $$
DECLARE
  v_tok public.mob_confirmation_tokens;
  v_ref TEXT;
  v_lead RECORD;
BEGIN
  SELECT * INTO v_tok FROM public.mob_confirmation_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  IF v_tok.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', true, 'status', v_tok.status);  -- idempotent
  END IF;
  IF v_tok.expires_at < now() THEN
    UPDATE public.mob_confirmation_tokens SET status = 'expired' WHERE id = v_tok.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.mob_confirmation_tokens
    SET status = 'confirmed', confirmed_at = now() WHERE id = v_tok.id;

  UPDATE public.mobilisation
    SET client_confirmed = true, client_confirmed_at = now(), updated_at = now()
    WHERE id = v_tok.mobilisation_id;

  INSERT INTO public.enquiry_events (enquiry_id, event_type, metadata)
    VALUES (v_tok.enquiry_id, 'mobilisation_confirmed',
            jsonb_build_object('confirmed_by', 'client', 'method', 'public_page'));

  SELECT ref_number INTO v_ref FROM public.enquiries WHERE id = v_tok.enquiry_id;

  -- Notify mobilization leads + the assigned team lead (closes gap H5)
  FOR v_lead IN
    SELECT DISTINCT uid FROM (
      SELECT id AS uid FROM public.profiles WHERE role = 'mobilization_lead' AND is_active
      UNION
      SELECT team_lead_id AS uid FROM public.mobilisation
        WHERE id = v_tok.mobilisation_id AND team_lead_id IS NOT NULL
    ) s WHERE uid IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, enquiry_id, link)
    VALUES (v_lead.uid, 'mobilization_confirmed',
            'Mobilisation Confirmed — ' || coalesce(v_ref, ''),
            'Client confirmed the mobilisation date.',
            v_tok.enquiry_id, '/enquiries/' || v_tok.enquiry_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4c. Propose an alternate date (notifies the leads)
CREATE OR REPLACE FUNCTION public.propose_alternate_mobilisation(
  p_token TEXT, p_date DATE, p_notes TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_tok public.mob_confirmation_tokens;
  v_ref TEXT;
  v_orig DATE;
  v_lead RECORD;
BEGIN
  SELECT * INTO v_tok FROM public.mob_confirmation_tokens WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;
  IF v_tok.status NOT IN ('pending', 'alternate_proposed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_' || v_tok.status);
  END IF;

  UPDATE public.mob_confirmation_tokens
    SET status = 'alternate_proposed', alternate_date = p_date, alternate_notes = p_notes
    WHERE id = v_tok.id;

  INSERT INTO public.enquiry_events (enquiry_id, event_type, metadata)
    VALUES (v_tok.enquiry_id, 'mobilisation_alternate_proposed',
            jsonb_build_object('alternate_date', p_date, 'notes', p_notes));

  SELECT ref_number INTO v_ref FROM public.enquiries WHERE id = v_tok.enquiry_id;
  SELECT mobilisation_date INTO v_orig FROM public.mobilisation WHERE id = v_tok.mobilisation_id;

  FOR v_lead IN
    SELECT id AS uid FROM public.profiles WHERE role = 'mobilization_lead' AND is_active
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, enquiry_id, link)
    VALUES (v_lead.uid, 'mobilization_alternate',
            'Alternate Date Proposed — ' || coalesce(v_ref, ''),
            'Client proposed ' || p_date || ' instead of ' || coalesce(v_orig::text, '') ||
              coalesce('. Reason: ' || nullif(p_notes, ''), ''),
            v_tok.enquiry_id, '/enquiries/' || v_tok.enquiry_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'status', 'alternate_proposed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_mob_confirmation(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_mobilisation(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propose_alternate_mobilisation(TEXT, DATE, TEXT) TO anon, authenticated;
