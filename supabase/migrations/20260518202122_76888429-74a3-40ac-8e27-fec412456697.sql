-- Bucket para respaldos de XML de DTE
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos-xml', 'documentos-xml', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Autenticados leen documentos-xml"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documentos-xml');

CREATE POLICY "Autenticados suben documentos-xml"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documentos-xml');

CREATE POLICY "Admin elimina documentos-xml"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documentos-xml' AND public.has_role(auth.uid(), 'admin'));
