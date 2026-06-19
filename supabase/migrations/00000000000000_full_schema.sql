-- ============================================================================
-- QMS Full Schema Migration — Fresh Supabase Project Setup
-- Run this in SQL Editor on the new project BEFORE deploying edge functions
-- ============================================================================

-- ─── 1. CUSTOM ENUM TYPES ───────────────────────────────────────────────────

CREATE TYPE public.comm_channel AS ENUM ('email', 'whatsapp', 'in_app');
CREATE TYPE public.comm_direction AS ENUM ('outbound', 'inbound');
CREATE TYPE public.followup_outcome AS ENUM (
  'pending', 'reached', 'no_response', 'callback_requested', 'closed'
);
CREATE TYPE public.lead_status AS ENUM (
  'new', 'intake_pending', 'pending', 'sent', 'follow_up', 'negotiation',
  'approved', 'payment_received', 'mobilization_scheduled', 'job_active',
  'confirmed', 'lost', 'inactive', 'completed'
);
CREATE TYPE public.payment_status AS ENUM (
  'pending_request', 'request_sent', 'received', 'partial', 'refunded'
);
CREATE TYPE public.quotation_status AS ENUM (
  'draft', 'approved', 'sent', 'accepted', 'rejected', 'superseded'
);
CREATE TYPE public.soil_type AS ENUM ('soil', 'rock', 'mixed');
CREATE TYPE public.structure_type AS ENUM (
  'residential', 'commercial', 'industrial', 'infrastructure', 'other'
);
CREATE TYPE public.user_role AS ENUM (
  'super_admin', 'admin', 'mobilization_lead', 'viewer'
);

-- ─── 2. HELPER FUNCTIONS (RLS, triggers) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
BEGIN
  RETURN coalesce(
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role'),
    'viewer'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean AS $$
BEGIN
  RETURN public.get_user_role() IN ('super_admin', 'admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_not_viewer()
RETURNS boolean AS $$
BEGIN
  RETURN public.get_user_role() != 'viewer';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── 3. TABLES ──────────────────────────────────────────────────────────────

-- 3.1 profiles (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  role public.user_role NOT NULL DEFAULT 'viewer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on new auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', ''),
    coalesce((NEW.raw_user_meta_data->>'role')::public.user_role, 'viewer')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3.2 clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  city TEXT NOT NULL,
  state TEXT,
  pincode TEXT,
  whatsapp_number TEXT,
  lead_source TEXT,
  source TEXT,
  service_type_interest TEXT,
  requirement_notes TEXT,
  notes TEXT,
  email_bounced BOOLEAN DEFAULT false,
  whatsapp_invalid BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 intake_tokens
CREATE TABLE public.intake_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  created_by UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active',
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.4 intake_submissions
CREATE TABLE public.intake_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id UUID NOT NULL REFERENCES public.intake_tokens(id),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  site_address TEXT NOT NULL,
  site_city TEXT NOT NULL,
  site_state TEXT,
  site_pincode TEXT,
  structure_type public.structure_type NOT NULL,
  num_floors INTEGER,
  basement_floors INTEGER,
  num_bores INTEGER NOT NULL,
  expected_depth_m NUMERIC,
  soil_type_hint public.soil_type,
  remarks TEXT,
  attachments JSONB,
  ip_address INET,
  user_agent TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.5 enquiries
CREATE TABLE public.enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  submission_id UUID REFERENCES public.intake_submissions(id),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL DEFAULT 'soil_investigation',
  status public.lead_status NOT NULL DEFAULT 'new',
  site_city TEXT NOT NULL,
  site_address TEXT,
  structure_type public.structure_type,
  soil_type_hint public.soil_type,
  num_bores INTEGER,
  expected_depth_m NUMERIC,
  enquiry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  next_follow_up TIMESTAMPTZ,
  confirmed_date TIMESTAMPTZ,
  lost_date TIMESTAMPTZ,
  lost_reason TEXT,
  lead_source TEXT,
  remarks TEXT,
  consultancy_data JSONB,
  site_visit_required BOOLEAN DEFAULT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate ref_number: TIV-YYYY-NNNN
CREATE OR REPLACE FUNCTION public.generate_ref_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year TEXT;
  next_seq INT;
BEGIN
  IF NEW.ref_number IS NOT NULL AND NEW.ref_number != '' THEN
    RETURN NEW;
  END IF;
  current_year := to_char(now(), 'YYYY');
  SELECT coalesce(max(
    nullif(substring(ref_number from 'TIV-' || current_year || '-(\d+)')::int, 0)
  ), 0) + 1
  INTO next_seq
  FROM public.enquiries
  WHERE ref_number LIKE 'TIV-' || current_year || '-%';
  NEW.ref_number := 'TIV-' || current_year || '-' || lpad(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_ref_number
  BEFORE INSERT ON public.enquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_ref_number();

-- 3.6 quotations
CREATE TABLE public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  variant TEXT NOT NULL,
  variant_label TEXT,
  variant_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  quotation_number TEXT NOT NULL,
  template_type TEXT NOT NULL DEFAULT 'original_si',
  service_type TEXT NOT NULL DEFAULT 'soil_investigation',
  status public.quotation_status NOT NULL DEFAULT 'draft',
  is_lump_sum BOOLEAN NOT NULL DEFAULT false,
  num_bores INTEGER,
  depth_per_bore_m NUMERIC,
  soil_type public.soil_type,
  rate_matrix_id UUID,
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12,2) NOT NULL,
  discount_type TEXT,
  discount_value NUMERIC,
  discount_amount NUMERIC,
  gst_rate NUMERIC,
  gst_type TEXT,
  gst_amount NUMERIC(12,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  mobilisation_cost NUMERIC,
  drilling_cost NUMERIC,
  reporting_cost NUMERIC,
  travel_cost NUMERIC,
  pdf_url TEXT,
  pdf_status TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  sent_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate quotation_number: QTN-YYYY-NNNNN
CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year TEXT;
  next_seq INT;
BEGIN
  current_year := to_char(now(), 'YYYY');
  SELECT coalesce(max(
    nullif(substring(quotation_number from 'QTN-' || current_year || '-(\d+)')::int, 0)
  ), 0) + 1
  INTO next_seq
  FROM public.quotations
  WHERE quotation_number LIKE 'QTN-' || current_year || '-%';
  NEW.quotation_number := 'QTN-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_quotation_number
  BEFORE INSERT ON public.quotations
  FOR EACH ROW
  WHEN (NEW.quotation_number IS NULL)
  EXECUTE FUNCTION public.generate_quotation_number();

CREATE UNIQUE INDEX idx_quotations_number_unique
  ON public.quotations (quotation_number)
  WHERE quotation_number IS NOT NULL;

-- 3.7 communication_log
CREATE TABLE public.communication_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id),
  channel public.comm_channel NOT NULL,
  direction public.comm_direction NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  attachments JSONB,
  template_id TEXT,
  external_msg_id TEXT,
  sent_by UUID,
  status TEXT,
  error_detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.8 follow_ups
CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT,
  notes TEXT,
  outcome public.followup_outcome NOT NULL DEFAULT 'pending',
  outcome_notes TEXT,
  auto_scheduled BOOLEAN DEFAULT false,
  reminder_sent BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.9 payments
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  quotation_id UUID REFERENCES public.quotations(id),
  payment_type TEXT NOT NULL,
  amount_requested NUMERIC(12,2) NOT NULL,
  amount_received NUMERIC(12,2),
  status public.payment_status NOT NULL DEFAULT 'pending_request',
  payment_method TEXT,
  transaction_ref TEXT,
  receipt_url TEXT,
  request_sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.10 mobilisation
CREATE TABLE public.mobilisation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL UNIQUE REFERENCES public.enquiries(id) ON DELETE CASCADE,
  team_lead_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  team_description TEXT,
  mobilisation_date DATE NOT NULL,
  mobilisation_time TEXT,
  site_contact_name TEXT,
  site_contact_phone TEXT,
  equipment_notes TEXT,
  notes TEXT,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  drive_folder_status TEXT,
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.11 job_completion
CREATE TABLE public.job_completion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL UNIQUE REFERENCES public.enquiries(id) ON DELETE CASCADE,
  mobilisation_id UUID REFERENCES public.mobilisation(id) ON DELETE SET NULL,
  site_completion_date DATE,
  site_completed_actual TIMESTAMPTZ,
  site_done BOOLEAN DEFAULT false,
  site_completion_notes TEXT,
  report_delivery_date DATE,
  report_delivered_actual TIMESTAMPTZ,
  report_done BOOLEAN DEFAULT false,
  report_delivery_notes TEXT,
  report_file_url TEXT,
  final_bill_date DATE,
  final_bill_raised_actual TIMESTAMPTZ,
  final_bill_done BOOLEAN DEFAULT false,
  final_bill_amount NUMERIC(12,2),
  final_bill_notes TEXT,
  final_bill_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.12 job_reminders
CREATE TABLE public.job_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.job_completion(id) ON DELETE CASCADE,
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL,
  target_date DATE NOT NULL,
  days_before INTEGER NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  channels TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.13 notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.14 enquiry_events (audit log)
CREATE TABLE public.enquiry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  from_status public.lead_status,
  to_status public.lead_status,
  triggered_by UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.15 app_settings (key-value store)
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3.16 rate_matrix
CREATE TABLE public.rate_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  city TEXT NOT NULL,
  state TEXT,
  structure_type public.structure_type NOT NULL,
  soil_type public.soil_type NOT NULL,
  rate_per_bore NUMERIC(12,2) NOT NULL,
  rate_per_metre_soil NUMERIC(12,2) NOT NULL,
  rate_per_metre_rock NUMERIC(12,2) NOT NULL,
  rate_reporting NUMERIC(12,2) NOT NULL,
  rate_travel_per_km NUMERIC(12,2),
  minimum_charge NUMERIC(12,2),
  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint: one active rate per city+structure+soil combo
CREATE UNIQUE INDEX idx_rate_matrix_unique_active
  ON public.rate_matrix (city, structure_type, soil_type)
  WHERE is_active = true;

-- 3.17 site_visits
CREATE TABLE public.site_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_id UUID NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  geologist_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  feasibility TEXT
    CHECK (feasibility IN ('feasible', 'conditional', 'not_feasible')),
  water_confirmed BOOLEAN DEFAULT false,
  access_confirmed BOOLEAN DEFAULT false,
  security_confirmed BOOLEAN DEFAULT false,
  fencing_confirmed BOOLEAN DEFAULT false,
  observations JSONB,
  cost_factors JSONB,
  recommendations TEXT,
  photos TEXT[] DEFAULT '{}',
  token TEXT NOT NULL UNIQUE,
  notification_sent BOOLEAN NOT NULL DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate 32-char URL-safe token for site visits
CREATE OR REPLACE FUNCTION public.generate_site_visit_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.token IS NULL THEN
    NEW.token := left(replace(gen_random_uuid()::text, '-', '') || left(replace(gen_random_uuid()::text, '-', ''), 8), 32);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_visit_token
  BEFORE INSERT ON public.site_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_site_visit_token();

-- ─── 4. INDEXES ─────────────────────────────────────────────────────────────

CREATE INDEX idx_enquiries_client_id ON public.enquiries(client_id);
CREATE INDEX idx_enquiries_status ON public.enquiries(status);
CREATE INDEX idx_enquiries_ref_number ON public.enquiries(ref_number);
CREATE INDEX idx_quotations_enquiry_id ON public.quotations(enquiry_id);
CREATE INDEX idx_communication_log_enquiry_id ON public.communication_log(enquiry_id);
CREATE INDEX idx_follow_ups_enquiry_id ON public.follow_ups(enquiry_id);
CREATE INDEX idx_follow_ups_scheduled_date ON public.follow_ups(scheduled_date);
CREATE INDEX idx_payments_enquiry_id ON public.payments(enquiry_id);
CREATE INDEX idx_mobilisation_enquiry_id ON public.mobilisation(enquiry_id);
CREATE INDEX idx_job_completion_enquiry_id ON public.job_completion(enquiry_id);
CREATE INDEX idx_job_reminders_enquiry_id ON public.job_reminders(enquiry_id);
CREATE INDEX idx_job_reminders_scheduled_for ON public.job_reminders(scheduled_for);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_enquiry_events_enquiry_id ON public.enquiry_events(enquiry_id);
CREATE INDEX idx_site_visits_enquiry_id ON public.site_visits(enquiry_id);
CREATE INDEX idx_site_visits_status ON public.site_visits(status);
CREATE INDEX idx_clients_deleted_at ON public.clients(deleted_at);
CREATE INDEX idx_enquiries_deleted_at ON public.enquiries(deleted_at);

-- ─── 5. UPDATED_AT TRIGGERS ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_enquiries_updated_at BEFORE UPDATE ON public.enquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_quotations_updated_at BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_follow_ups_updated_at BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mobilisation_updated_at BEFORE UPDATE ON public.mobilisation
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_job_completion_updated_at BEFORE UPDATE ON public.job_completion
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_site_visits_updated_at BEFORE UPDATE ON public.site_visits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 6. STATUS TRANSITION VALIDATION TRIGGER ────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  allowed text[];
  user_role text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    user_role := coalesce(
      current_setting('request.jwt.claims', true)::json->>'role',
      (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role')
    );
  EXCEPTION WHEN OTHERS THEN
    user_role := NULL;
  END;

  IF user_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status::text
    WHEN 'new' THEN ARRAY['intake_pending', 'pending', 'lost', 'inactive']
    WHEN 'intake_pending' THEN ARRAY['pending', 'lost', 'inactive']
    WHEN 'pending' THEN ARRAY['sent', 'lost', 'inactive']
    WHEN 'sent' THEN ARRAY['follow_up', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'follow_up' THEN ARRAY['sent', 'negotiation', 'approved', 'lost', 'inactive']
    WHEN 'negotiation' THEN ARRAY['sent', 'approved', 'lost', 'inactive']
    WHEN 'approved' THEN ARRAY['payment_received', 'lost', 'inactive']
    WHEN 'payment_received' THEN ARRAY['mobilization_scheduled', 'lost', 'inactive']
    WHEN 'mobilization_scheduled' THEN ARRAY['job_active', 'lost', 'inactive']
    WHEN 'job_active' THEN ARRAY['completed', 'lost', 'inactive']
    WHEN 'confirmed' THEN ARRAY['completed', 'lost', 'inactive']
    WHEN 'lost' THEN ARRAY['follow_up']
    WHEN 'inactive' THEN ARRAY['follow_up']
    WHEN 'completed' THEN ARRAY[]::text[]
    ELSE ARRAY[]::text[]
  END;

  IF NOT (NEW.status::text = ANY(allowed)) THEN
    RAISE EXCEPTION 'Invalid status transition: "%" → "%". Allowed from "%": %',
      OLD.status, NEW.status, OLD.status, array_to_string(allowed, ', ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_validate_status
  BEFORE UPDATE ON public.enquiries
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_status_transition();

-- ─── 7. RPC FUNCTIONS ──────────────────────────────────────────────────────

-- submit_intake_form: atomic intake submission + enquiry creation/update
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
AS $$
DECLARE
  v_token_row intake_tokens%ROWTYPE;
  v_submission_id UUID;
  v_enquiry_id UUID;
  v_ref_number TEXT;
  v_existing_enquiry_id UUID;
BEGIN
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

  INSERT INTO intake_submissions (
    token_id, client_id, site_address, site_city, site_state, site_pincode,
    structure_type, num_floors, basement_floors, num_bores,
    expected_depth_m, soil_type_hint, remarks
  ) VALUES (
    v_token_row.id, v_token_row.client_id, p_site_address, p_site_city,
    p_site_state, p_site_pincode, p_structure_type, p_num_floors,
    p_basement_floors, p_num_bores, p_expected_depth_m, p_soil_type_hint, p_remarks
  ) RETURNING id INTO v_submission_id;

  UPDATE intake_tokens
  SET status = 'used', used_at = NOW()
  WHERE id = v_token_row.id;

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

  RETURN json_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'enquiry_id', v_enquiry_id,
    'ref_number', v_ref_number
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

-- notify_admin_intake: called after intake to create in-app notification
CREATE OR REPLACE FUNCTION public.notify_admin_intake(
  p_city text,
  p_client_name text,
  p_enquiry_id text,
  p_ref_number text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  FOR v_admin_id IN
    SELECT id FROM public.profiles
    WHERE role IN ('super_admin', 'admin') AND is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, enquiry_id, type, title, body, link)
    VALUES (
      v_admin_id,
      p_enquiry_id::uuid,
      'intake_submitted',
      'New Intake Submission',
      p_client_name || ' submitted intake for ' || p_city || ' (' || p_ref_number || ')',
      '/enquiries/' || p_enquiry_id
    );
  END LOOP;
END;
$$;

-- ─── 8. ROW LEVEL SECURITY ─────────────────────────────────────────────────

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- clients
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated USING (is_editor());

-- intake_tokens
ALTER TABLE public.intake_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake_tokens_select_auth" ON public.intake_tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "intake_tokens_select_anon" ON public.intake_tokens FOR SELECT TO anon USING (true);
CREATE POLICY "intake_tokens_insert" ON public.intake_tokens FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "intake_tokens_update" ON public.intake_tokens FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

-- intake_submissions
ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake_submissions_select" ON public.intake_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "intake_submissions_insert_anon" ON public.intake_submissions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "intake_submissions_insert_auth" ON public.intake_submissions FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

-- enquiries
ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enquiries_select" ON public.enquiries FOR SELECT TO authenticated USING (true);
CREATE POLICY "enquiries_insert" ON public.enquiries FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "enquiries_update" ON public.enquiries FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());
CREATE POLICY "enquiries_delete" ON public.enquiries FOR DELETE TO authenticated USING (is_editor());

-- quotations
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotations_select" ON public.quotations FOR SELECT TO authenticated USING (true);
CREATE POLICY "quotations_insert" ON public.quotations FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "quotations_update" ON public.quotations FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
CREATE POLICY "quotations_delete" ON public.quotations FOR DELETE TO authenticated USING (is_editor());

-- communication_log
ALTER TABLE public.communication_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "communication_log_select" ON public.communication_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "communication_log_insert" ON public.communication_log FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "communication_log_update" ON public.communication_log FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

-- follow_ups
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follow_ups_select" ON public.follow_ups FOR SELECT TO authenticated USING (true);
CREATE POLICY "follow_ups_insert" ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "follow_ups_update" ON public.follow_ups FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());
CREATE POLICY "follow_ups_delete" ON public.follow_ups FOR DELETE TO authenticated USING (is_editor());

-- payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments_select" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "payments_insert" ON public.payments FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "payments_update" ON public.payments FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
CREATE POLICY "payments_delete" ON public.payments FOR DELETE TO authenticated USING (is_editor());

-- mobilisation
ALTER TABLE public.mobilisation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mobilisation_select" ON public.mobilisation FOR SELECT TO authenticated USING (true);
CREATE POLICY "mobilisation_insert" ON public.mobilisation FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "mobilisation_update" ON public.mobilisation FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());
CREATE POLICY "mobilisation_delete" ON public.mobilisation FOR DELETE TO authenticated USING (is_editor());

-- job_completion
ALTER TABLE public.job_completion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_completion_select" ON public.job_completion FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_completion_insert" ON public.job_completion FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "job_completion_update" ON public.job_completion FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

-- job_reminders
ALTER TABLE public.job_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_reminders_select" ON public.job_reminders FOR SELECT TO authenticated USING (true);
CREATE POLICY "job_reminders_insert" ON public.job_reminders FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "job_reminders_update" ON public.job_reminders FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

-- notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- enquiry_events
ALTER TABLE public.enquiry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "enquiry_events_select" ON public.enquiry_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "enquiry_events_insert_auth" ON public.enquiry_events FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
CREATE POLICY "enquiry_events_insert_anon" ON public.enquiry_events FOR INSERT TO anon WITH CHECK (true);

-- app_settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_select" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_insert" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "app_settings_update" ON public.app_settings FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
CREATE POLICY "app_settings_delete" ON public.app_settings FOR DELETE TO authenticated USING (is_editor());

-- rate_matrix
ALTER TABLE public.rate_matrix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rate_matrix_select" ON public.rate_matrix FOR SELECT TO authenticated USING (true);
CREATE POLICY "rate_matrix_insert" ON public.rate_matrix FOR INSERT TO authenticated WITH CHECK (is_editor());
CREATE POLICY "rate_matrix_update" ON public.rate_matrix FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());
CREATE POLICY "rate_matrix_delete" ON public.rate_matrix FOR DELETE TO authenticated USING (is_editor());

-- site_visits
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_visits_select_auth" ON public.site_visits FOR SELECT TO authenticated USING (true);
CREATE POLICY "site_visits_select_anon" ON public.site_visits FOR SELECT TO anon USING (true);
CREATE POLICY "site_visits_insert" ON public.site_visits FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "site_visits_update_auth" ON public.site_visits FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "site_visits_update_anon" ON public.site_visits FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "site_visits_delete" ON public.site_visits FOR DELETE TO authenticated USING (true);

-- ─── 9. STORAGE BUCKETS ────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public) VALUES
  ('quotation-pdfs', 'quotation-pdfs', false),
  ('receipts', 'receipts', false),
  ('reports', 'reports', false),
  ('site-visit-photos', 'site-visit-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated can upload/read all private buckets
CREATE POLICY "Auth upload quotation-pdfs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quotation-pdfs');
CREATE POLICY "Auth read quotation-pdfs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quotation-pdfs');

CREATE POLICY "Auth upload receipts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "Auth read receipts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

CREATE POLICY "Auth upload reports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reports');
CREATE POLICY "Auth read reports" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'reports');

CREATE POLICY "Auth upload site-visit-photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-visit-photos');
CREATE POLICY "Auth read site-visit-photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-visit-photos');
CREATE POLICY "Editors delete site-visit-photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-visit-photos' AND public.is_not_viewer());

-- ─── DONE ───────────────────────────────────────────────────────────────────
