-- intake-uploads bucket (public intake-form attachments) — present in the live DB
-- but missing from the full_schema snapshot. Idempotent so it is safe to re-run.
INSERT INTO storage.buckets (id, name, public)
VALUES ('intake-uploads', 'intake-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Public intake form is anon; it uploads attachments and reads them back by URL.
DROP POLICY IF EXISTS "intake_uploads_insert_anon" ON storage.objects;
CREATE POLICY "intake_uploads_insert_anon" ON storage.objects FOR INSERT TO anon
  WITH CHECK (bucket_id = 'intake-uploads');

DROP POLICY IF EXISTS "intake_uploads_insert_auth" ON storage.objects;
CREATE POLICY "intake_uploads_insert_auth" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'intake-uploads');

DROP POLICY IF EXISTS "intake_uploads_read" ON storage.objects;
CREATE POLICY "intake_uploads_read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'intake-uploads');
