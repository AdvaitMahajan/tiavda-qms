-- Add photos column to site_visits for site visit photo storage
ALTER TABLE public.site_visits ADD COLUMN IF NOT EXISTS photos TEXT[] DEFAULT '{}';

-- Create storage bucket for site visit photos (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-visit-photos', 'site-visit-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: authenticated users can upload/read site visit photos
CREATE POLICY "Authenticated users can upload site visit photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'site-visit-photos');

CREATE POLICY "Authenticated users can read site visit photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'site-visit-photos');

CREATE POLICY "Editors can delete site visit photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'site-visit-photos' AND public.is_not_viewer());
