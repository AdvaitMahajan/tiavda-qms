-- =============================================================================
-- Security hardening + critical workflow fixes (re-verification follow-up).
-- =============================================================================

-- 1. notifications: a user may only modify THEIR OWN notifications ------------
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2. Status machine: make the post-sale flow actually completable -------------
-- Previously: approved→payment_received only, and completed only from job_active
-- (which nothing auto-set) → job completion could never persist, and scheduling
-- mobilisation from 'approved' (pre-payment planning, allowed in the UI) was
-- silently rejected. Relax the post-approval transitions to match real usage,
-- while still preventing early stages from jumping to terminal states.
CREATE OR REPLACE FUNCTION public.validate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed text[];
  user_role text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF OLD.status IS NULL THEN RETURN NEW; END IF;

  user_role := public.get_user_role();
  IF user_role = 'super_admin' THEN RETURN NEW; END IF;

  allowed := CASE OLD.status::text
    WHEN 'new' THEN ARRAY['intake_pending', 'pending', 'lost', 'inactive']
    WHEN 'intake_pending' THEN ARRAY['pending', 'lost', 'inactive']
    WHEN 'pending' THEN ARRAY['sent', 'lost', 'inactive']
    WHEN 'sent' THEN ARRAY['follow_up', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'follow_up' THEN ARRAY['sent', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'negotiation' THEN ARRAY['sent', 'approved', 'lost', 'inactive']
    WHEN 'approved' THEN ARRAY['payment_received', 'mobilization_scheduled', 'lost', 'inactive']
    WHEN 'payment_received' THEN ARRAY['mobilization_scheduled', 'job_active', 'completed', 'lost', 'inactive']
    WHEN 'mobilization_scheduled' THEN ARRAY['job_active', 'completed', 'lost', 'inactive']
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

-- 3. Let non-viewer staff flag a bad contact channel without clients-write -----
-- (Fixes the H11 regression: a mobilization_lead can no longer UPDATE clients,
-- so the whatsapp_invalid/email_bounced marking during a send was silently
-- blocked. This SECURITY DEFINER RPC performs only that narrow update.)
CREATE OR REPLACE FUNCTION public.flag_contact_channel_invalid(p_client_id uuid, p_channel text)
RETURNS void AS $$
BEGIN
  IF public.get_user_role() = 'viewer' THEN
    RAISE EXCEPTION 'insufficient_privilege';
  END IF;
  IF p_channel = 'whatsapp' THEN
    UPDATE public.clients SET whatsapp_invalid = true WHERE id = p_client_id;
  ELSIF p_channel = 'email' THEN
    UPDATE public.clients SET email_bounced = true WHERE id = p_client_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.flag_contact_channel_invalid(uuid, text) TO authenticated;

-- 4. Lock down site_visits + provide public RPCs for the token-based form ------
-- Previously anon could SELECT/UPDATE ANY site_visit row (USING(true)). Replace
-- with: staff-only direct access, and SECURITY DEFINER RPCs for the public form.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='site_visits' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.site_visits', p.policyname);
  END LOOP;
END $$;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_visits_select" ON public.site_visits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "site_visits_insert" ON public.site_visits
  FOR INSERT TO authenticated WITH CHECK (public.is_not_viewer());
CREATE POLICY "site_visits_update" ON public.site_visits
  FOR UPDATE TO authenticated USING (public.is_not_viewer()) WITH CHECK (public.is_not_viewer());
CREATE POLICY "site_visits_delete" ON public.site_visits
  FOR DELETE TO authenticated USING (public.is_editor());

CREATE OR REPLACE FUNCTION public.get_site_visit(p_token TEXT)
RETURNS JSONB AS $$
DECLARE v public.site_visits; v_result JSONB;
BEGIN
  SELECT * INTO v FROM public.site_visits WHERE token = p_token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'id', v.id, 'visit_date', v.visit_date, 'status', v.status, 'enquiry_id', v.enquiry_id,
    'observations', v.observations, 'recommendations', v.recommendations,
    'cost_factors', v.cost_factors, 'feasibility', v.feasibility,
    'water_confirmed', v.water_confirmed, 'access_confirmed', v.access_confirmed,
    'security_confirmed', v.security_confirmed, 'fencing_confirmed', v.fencing_confirmed,
    'enquiry', (SELECT jsonb_build_object(
        'ref_number', e.ref_number, 'site_address', e.site_address, 'site_city', e.site_city,
        'structure_type', e.structure_type, 'num_bores', e.num_bores,
        'expected_depth_m', e.expected_depth_m, 'soil_type_hint', e.soil_type_hint,
        'client', (SELECT jsonb_build_object('name', c.name, 'phone', c.phone, 'email', c.email, 'company', c.company)
                   FROM public.clients c WHERE c.id = e.client_id))
      FROM public.enquiries e WHERE e.id = v.enquiry_id)
  ) INTO v_result;
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.submit_site_visit(
  p_token TEXT, p_feasibility TEXT,
  p_water BOOLEAN, p_access BOOLEAN, p_security BOOLEAN, p_fencing BOOLEAN,
  p_observations TEXT, p_recommendations TEXT, p_cost_factors JSONB
)
RETURNS JSONB AS $$
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
    recommendations = p_recommendations, cost_factors = p_cost_factors,
    updated_at = now()
  WHERE id = v.id;
  INSERT INTO public.enquiry_events (enquiry_id, event_type, metadata)
    VALUES (v.enquiry_id, 'site_visit_completed',
            jsonb_build_object('feasibility', p_feasibility, 'visit_id', v.id, 'submitted_via', 'public_form'));
  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_site_visit(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_site_visit(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, JSONB) TO anon, authenticated;

-- 5. Intake file uploads: a scoped PUBLIC bucket + a scoped attach RPC ---------
-- (Fixes the H9 regression where required photos/layout silently vanished:
-- anon couldn't write the private receipts bucket nor UPDATE intake_submissions.)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('intake-uploads', 'intake-uploads', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anon upload intake-uploads" ON storage.objects;
CREATE POLICY "Anon upload intake-uploads" ON storage.objects
  FOR INSERT TO anon WITH CHECK (bucket_id = 'intake-uploads');
DROP POLICY IF EXISTS "Public read intake-uploads" ON storage.objects;
CREATE POLICY "Public read intake-uploads" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'intake-uploads');

-- Anon attaches uploaded file metadata to its own submission (scoped by id).
CREATE OR REPLACE FUNCTION public.attach_intake_files(p_submission_id uuid, p_attachments jsonb)
RETURNS void AS $$
BEGIN
  UPDATE public.intake_submissions SET attachments = p_attachments WHERE id = p_submission_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.attach_intake_files(uuid, jsonb) TO anon, authenticated;
