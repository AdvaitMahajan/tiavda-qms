-- Add template_type column to quotations table
-- Supports multiple BOQ templates: original_si, boq_type_1, boq_type_2, boq_type_3
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'original_si';
