-- =============================================================================
-- Spelling corrections to the seeded Terms & Conditions, at the client's
-- request: "accomodation" -> "accommodation", "quantites" -> "quantities".
--
-- Applied by replacement rather than by overwriting the whole note, so a note
-- the firm has since reworded keeps its own wording and only the misspelling
-- is fixed. Runs against every org and is safe to re-run.
-- =============================================================================

UPDATE public.app_settings
SET value = replace(value, 'accomodation', 'accommodation')
WHERE key LIKE 'quotation_note_%' AND value LIKE '%accomodation%';

UPDATE public.app_settings
SET value = replace(value, 'quantites', 'quantities')
WHERE key LIKE 'quotation_note_%' AND value LIKE '%quantites%';
