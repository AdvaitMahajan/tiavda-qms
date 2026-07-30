-- =============================================================================
-- Reference prefix: TIV → GG (enquiries) and QTN → GGQ (quotations).
--
-- NEW records only. Existing TIV-/QTN- rows are untouched — they're already in
-- sent PDFs, invoices and client emails, so renumbering them would break that
-- paper trail. Because the per-year sequence counts only rows already matching
-- the current prefix, the new GG-/GGQ- series each start at 0001 for the year.
-- Lists will show a mix of old and new prefixes — intended.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generate_ref_number()
RETURNS TRIGGER AS $$
DECLARE current_year TEXT; next_seq INT;
BEGIN
  IF NEW.ref_number IS NOT NULL AND NEW.ref_number != '' THEN RETURN NEW; END IF;
  current_year := to_char(now(), 'YYYY');
  SELECT coalesce(max(
    nullif(substring(ref_number from 'GG-' || current_year || '-(\d+)')::int, 0)
  ), 0) + 1
  INTO next_seq
  FROM public.enquiries
  WHERE org_id = NEW.org_id AND ref_number LIKE 'GG-' || current_year || '-%';
  NEW.ref_number := 'GG-' || current_year || '-' || lpad(next_seq::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS TRIGGER AS $$
DECLARE current_year text; next_seq int;
BEGIN
  current_year := to_char(now(), 'YYYY');
  SELECT coalesce(max(
    nullif(substring(quotation_number from 'GGQ-' || current_year || '-(\d+)')::int, 0)
  ), 0) + 1
  INTO next_seq
  FROM public.quotations
  WHERE org_id = NEW.org_id AND quotation_number LIKE 'GGQ-' || current_year || '-%';
  NEW.quotation_number := 'GGQ-' || current_year || '-' || lpad(next_seq::text, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
