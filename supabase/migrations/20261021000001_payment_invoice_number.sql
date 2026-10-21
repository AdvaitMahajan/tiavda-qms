-- =============================================================================
-- Stored, sequential invoice numbers.
--
-- Invoice numbers used to be derived from the payment's UUID on every render
-- (GG-INV-2026-3F9A1C), so they were neither sequential nor editable. They are
-- now chosen when the invoice is generated — the API suggests the next number
-- in the year's series (GG-INV-YYYY-001) and the user may edit it — and stored
-- on the payment so a re-download prints the same number.
--
-- The API also applies this at startup (server/src/lib/ensure-schema.ts), since
-- migrations are not run on deploy. Both are idempotent.
-- =============================================================================

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS invoice_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_org_invoice_number_uq
  ON public.payments (org_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
