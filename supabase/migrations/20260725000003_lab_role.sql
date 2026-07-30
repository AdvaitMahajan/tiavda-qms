-- =============================================================================
-- New role: lab (Lab Team) — for the laboratory processing workflow (#8).
-- Additive, like 20260724000002. "Site Supervisor" maps to the mobilisation
-- team lead and "Manager" to Admin/Execution Head, so only Lab is a new role.
-- =============================================================================
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'lab';
