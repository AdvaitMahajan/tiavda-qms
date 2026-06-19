-- Add quotation_number column with auto-generation trigger
-- Format: QTN-YYYY-NNNNN (e.g., QTN-2026-00001)

-- Add column (nullable initially for backfill)
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS quotation_number TEXT;

-- Create unique index (partial: only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_number_unique
  ON public.quotations (quotation_number)
  WHERE quotation_number IS NOT NULL;

-- Auto-generation function
CREATE OR REPLACE FUNCTION public.generate_quotation_number()
RETURNS TRIGGER AS $$
DECLARE
  current_year text;
  next_seq int;
BEGIN
  current_year := to_char(now(), 'YYYY');

  -- Get next sequence number for this year
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

-- Create trigger
DROP TRIGGER IF EXISTS trg_generate_quotation_number ON public.quotations;
CREATE TRIGGER trg_generate_quotation_number
  BEFORE INSERT ON public.quotations
  FOR EACH ROW
  WHEN (NEW.quotation_number IS NULL)
  EXECUTE FUNCTION public.generate_quotation_number();

-- Backfill existing rows (ordered by created_at)
DO $$
DECLARE
  rec RECORD;
  seq int := 0;
  yr text;
BEGIN
  yr := to_char(now(), 'YYYY');
  FOR rec IN
    SELECT id FROM public.quotations
    WHERE quotation_number IS NULL
    ORDER BY created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE public.quotations
    SET quotation_number = 'QTN-' || yr || '-' || lpad(seq::text, 5, '0')
    WHERE id = rec.id;
  END LOOP;
END $$;

-- Make column NOT NULL after backfill
ALTER TABLE public.quotations ALTER COLUMN quotation_number SET NOT NULL;
