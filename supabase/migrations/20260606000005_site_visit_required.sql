-- Add site_visit_required flag to enquiries for decision gate
-- NULL = undecided, true = required, false = not required
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS site_visit_required BOOLEAN DEFAULT NULL;
