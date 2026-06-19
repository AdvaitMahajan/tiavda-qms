-- Track the due date on payment requests (collected at request time, was discarded).
-- Powers the Accounts summary's overdue / due-date analysis.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_payments_due_date ON public.payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_received_at ON public.payments(received_at);
