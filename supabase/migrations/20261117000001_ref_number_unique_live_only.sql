-- =============================================================================
-- A soft-deleted enquiry releases its reference number.
--
-- Uniqueness of (org_id, ref_number) now applies only to live enquiries, so a
-- custom reference used on a lead that was later deleted can be used again.
-- Auto-generated numbers are unaffected: generate_ref_number() continues from
-- the highest number ever issued (deleted rows included), so it never reuses one.
--
-- Also applied by the API at startup (server/src/lib/ensure-schema.ts).
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_org_ref_live
  ON public.enquiries (org_id, ref_number) WHERE deleted_at IS NULL;
DROP INDEX IF EXISTS public.idx_enquiries_org_ref;
