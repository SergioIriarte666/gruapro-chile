DROP POLICY IF EXISTS "Fotos servicios son públicas" ON storage.objects;

CREATE POLICY "Autenticados listan fotos servicios"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'fotos-servicios');