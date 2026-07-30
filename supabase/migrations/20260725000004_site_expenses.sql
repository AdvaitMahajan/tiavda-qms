-- =============================================================================
-- Site Expenses under Mobilisation (change request #6).
--
-- A Site Supervisor (the mobilisation team lead) records mobilisation-related
-- expenses; a Manager (Admin / Execution Head) approves or rejects. Status +
-- approver columns follow the quotations.approved_by/approved_at precedent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.site_expenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enquiry_id   uuid NOT NULL REFERENCES public.enquiries(id) ON DELETE CASCADE,
  expense_head text NOT NULL DEFAULT 'site_expenses',
  description  text,
  amount       numeric(12,2) NOT NULL DEFAULT 0,
  expense_date date,
  receipt_url  text,
  status       text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  submitted_by uuid,
  approved_by  uuid,
  approved_at  timestamptz,
  decision_note text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.site_expenses
    ADD CONSTRAINT site_expenses_status_chk CHECK (status IN ('pending','approved','rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_site_expenses_enquiry ON public.site_expenses(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_site_expenses_org     ON public.site_expenses(org_id);

DO $$
BEGIN
  CREATE TRIGGER set_site_expenses_updated_at
    BEFORE UPDATE ON public.site_expenses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.site_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_expenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.site_expenses;
CREATE POLICY org_isolation ON public.site_expenses
  USING (org_id = current_setting('app.current_org_id', true)::uuid)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_expenses TO app_tenant;
