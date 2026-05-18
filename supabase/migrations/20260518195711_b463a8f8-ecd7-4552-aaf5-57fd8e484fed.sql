-- Crear bucket público para fotos de servicios
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos-servicios', 'fotos-servicios', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS para el bucket
CREATE POLICY "Fotos servicios son públicas"
ON storage.objects FOR SELECT
USING (bucket_id = 'fotos-servicios');

CREATE POLICY "Autenticados suben fotos servicios"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'fotos-servicios');

CREATE POLICY "Autenticados actualizan fotos servicios"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'fotos-servicios');

CREATE POLICY "Autenticados eliminan fotos servicios"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'fotos-servicios');