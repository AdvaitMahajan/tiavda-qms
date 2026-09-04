-- =============================================================================
-- Terms & Conditions for SI quotations, taken from the client's own template
-- (Global Geotechnics "Quotation for geotechnical investigation (Rate Only)").
--
-- Text is reproduced verbatim from that document, including its spelling, so
-- the printed quotation matches what the firm already sends. The template
-- numbers two notes "3"; they are renumbered sequentially here because the PDF
-- numbers the list automatically.
--
-- Seeded per org, and only where the key has no value yet, so anything already
-- typed into Settings is left alone.
-- =============================================================================

INSERT INTO public.app_settings (org_id, key, value)
SELECT o.id, v.key, v.value
FROM public.organizations o
CROSS JOIN (VALUES
  ('quotation_note_1',  'The provision of water for drilling purposes at borehole location to be made by the client.'),
  ('quotation_note_2',  'Clean place to make hutment or room for labour''s accomodation (at site) should be arranged by client.'),
  ('quotation_note_3',  'If the height of the proposed structure exceeds 120 meters, the investigation is required to be carried out in accordance with HRC norms. In this regard, the borehole depth shall be maintained at a minimum of 50 meters.'),
  ('quotation_note_4',  'Upon approval of the quotation, work will commence within three to four days, contingent upon receipt of the formal work order, advance payment, and site clearance. Please be advised that the final report will be issued only upon receipt of the final payment.'),
  ('quotation_note_5',  'Clear access to the borehole location provided by client.'),
  ('quotation_note_6',  'The Reduced Levels of Borehole point provided by client before completion of field work.'),
  ('quotation_note_7',  'Permission from authorities to work in project area shall be taken by client'),
  ('quotation_note_8',  'Any disturbance due to local problems shall be tackled by the client. Additional charges shall be applied for demobilisation of equipment'),
  ('quotation_note_9',  'The rates presented herewith are valid only for a period of 30 days from the date of quotation'),
  ('quotation_note_10', 'The quantities presented herewith are assumed on the basis of working in the general project area. Actual quantites may vary and the final billing shall be done on the basis of actual quantities only.'),
  ('quotation_payment_terms', '50% of quoted charges along with work order  |  40% on completion of field work & before submission of report  |  10% on submission of report')
) AS v(key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_settings s
  WHERE s.org_id = o.id AND s.key = v.key AND coalesce(s.value, '') <> ''
);
