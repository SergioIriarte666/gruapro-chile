-- Bucket de comprobantes de costos
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprobantes', 'comprobantes', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Comprobantes son públicos"
ON storage.objects FOR SELECT
USING (bucket_id = 'comprobantes');

CREATE POLICY "Autenticados suben comprobantes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'comprobantes');

CREATE POLICY "Autenticados actualizan comprobantes"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'comprobantes');

CREATE POLICY "Admin elimina comprobantes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'comprobantes' AND public.has_role(auth.uid(), 'admin'));