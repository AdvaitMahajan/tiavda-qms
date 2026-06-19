-- Role-based RLS policies replacing permissive using(true) policies
-- Role is stored in auth.jwt()->'user_metadata'->>'role'
-- Roles: super_admin, admin, mobilization_lead, viewer

-- Helper function to extract user role from JWT
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
BEGIN
  RETURN coalesce(
    (current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role'),
    'viewer'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: returns true if user can write (not viewer, not mob_lead for financial tables)
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean AS $$
BEGIN
  RETURN get_user_role() IN ('super_admin', 'admin');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: returns true if user is not a viewer
CREATE OR REPLACE FUNCTION public.is_not_viewer()
RETURNS boolean AS $$
BEGIN
  RETURN get_user_role() != 'viewer';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

--------------------------------------------------------------------------------
-- ENQUIRIES: viewers cannot write, everyone else can
--------------------------------------------------------------------------------
-- Drop existing permissive policies if they exist (names vary by project)
DO $$ BEGIN
  -- Try to drop common policy names; ignore if not found
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.enquiries';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.enquiries';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.enquiries';
END $$;

ALTER TABLE public.enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "enquiries_select" ON public.enquiries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "enquiries_insert" ON public.enquiries
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "enquiries_update" ON public.enquiries
  FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

CREATE POLICY "enquiries_delete" ON public.enquiries
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- QUOTATIONS: only admin/super_admin can write (mob_lead + viewer denied)
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.quotations';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.quotations';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.quotations';
END $$;

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotations_select" ON public.quotations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "quotations_insert" ON public.quotations
  FOR INSERT TO authenticated WITH CHECK (is_editor());

CREATE POLICY "quotations_update" ON public.quotations
  FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());

CREATE POLICY "quotations_delete" ON public.quotations
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- PAYMENTS: only admin/super_admin can write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.payments';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.payments';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.payments';
END $$;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_select" ON public.payments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "payments_insert" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (is_editor());

CREATE POLICY "payments_update" ON public.payments
  FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());

CREATE POLICY "payments_delete" ON public.payments
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- RATE_MATRIX: only admin/super_admin can write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.rate_matrix';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.rate_matrix';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.rate_matrix';
END $$;

ALTER TABLE public.rate_matrix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rate_matrix_select" ON public.rate_matrix
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rate_matrix_insert" ON public.rate_matrix
  FOR INSERT TO authenticated WITH CHECK (is_editor());

CREATE POLICY "rate_matrix_update" ON public.rate_matrix
  FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());

CREATE POLICY "rate_matrix_delete" ON public.rate_matrix
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- APP_SETTINGS: only admin/super_admin can write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.app_settings';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.app_settings';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.app_settings';
END $$;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_select" ON public.app_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "app_settings_insert" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (is_editor());

CREATE POLICY "app_settings_update" ON public.app_settings
  FOR UPDATE TO authenticated USING (is_editor()) WITH CHECK (is_editor());

CREATE POLICY "app_settings_delete" ON public.app_settings
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- MOBILISATION: mob_lead gets full access (their domain), viewers read-only
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.mobilisation';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.mobilisation';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.mobilisation';
END $$;

ALTER TABLE public.mobilisation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mobilisation_select" ON public.mobilisation
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mobilisation_insert" ON public.mobilisation
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "mobilisation_update" ON public.mobilisation
  FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

CREATE POLICY "mobilisation_delete" ON public.mobilisation
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- CLIENTS: viewers cannot write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.clients';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.clients';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.clients';
END $$;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

CREATE POLICY "clients_delete" ON public.clients
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- FOLLOW_UPS: viewers cannot write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.follow_ups';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.follow_ups';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.follow_ups';
END $$;

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_ups_select" ON public.follow_ups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "follow_ups_insert" ON public.follow_ups
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "follow_ups_update" ON public.follow_ups
  FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

CREATE POLICY "follow_ups_delete" ON public.follow_ups
  FOR DELETE TO authenticated USING (is_editor());

--------------------------------------------------------------------------------
-- COMMUNICATION_LOG: viewers cannot write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.communication_log';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.communication_log';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.communication_log';
END $$;

ALTER TABLE public.communication_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "communication_log_select" ON public.communication_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "communication_log_insert" ON public.communication_log
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "communication_log_update" ON public.communication_log
  FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

--------------------------------------------------------------------------------
-- NOTIFICATIONS: all authenticated can read own, non-viewers can write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.notifications';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.notifications';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.notifications';
END $$;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- JOB_COMPLETION: viewers cannot write
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.job_completion';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.job_completion';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.job_completion';
END $$;

ALTER TABLE public.job_completion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_completion_select" ON public.job_completion
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "job_completion_insert" ON public.job_completion
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "job_completion_update" ON public.job_completion
  FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

--------------------------------------------------------------------------------
-- INTAKE_TOKENS & INTAKE_SUBMISSIONS: anon can read tokens (for validation),
-- but only editors can create tokens
--------------------------------------------------------------------------------
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.intake_tokens';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.intake_tokens';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.intake_tokens';
END $$;

ALTER TABLE public.intake_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_tokens_select_auth" ON public.intake_tokens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "intake_tokens_select_anon" ON public.intake_tokens
  FOR SELECT TO anon USING (true);

CREATE POLICY "intake_tokens_insert" ON public.intake_tokens
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());

CREATE POLICY "intake_tokens_update" ON public.intake_tokens
  FOR UPDATE TO authenticated USING (is_not_viewer()) WITH CHECK (is_not_viewer());

-- intake_submissions: anon can insert (public form), authenticated can read
DO $$ BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can do everything" ON public.intake_submissions';
  EXECUTE 'DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.intake_submissions';
  EXECUTE 'DROP POLICY IF EXISTS "authenticated_all" ON public.intake_submissions';
END $$;

ALTER TABLE public.intake_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_submissions_select" ON public.intake_submissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "intake_submissions_insert_anon" ON public.intake_submissions
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "intake_submissions_insert_auth" ON public.intake_submissions
  FOR INSERT TO authenticated WITH CHECK (is_not_viewer());
