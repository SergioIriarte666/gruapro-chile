-- Permite que usuarios autenticados inserten auditoría desde la app.
DROP POLICY IF EXISTS "Admins insertan historial" ON public.service_change_history;

CREATE POLICY "Autenticados insertan historial"
ON public.service_change_history
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Mantiene lectura restringida a admin, pero habilita uso operativo de la app.

-- Bucket de PDFs de OC: políticas mínimas para upload/lectura.
DROP POLICY IF EXISTS "Autenticados leen oc-clientes" ON storage.objects;
CREATE POLICY "Autenticados leen oc-clientes"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'oc-clientes');

DROP POLICY IF EXISTS "Autenticados suben oc-clientes" ON storage.objects;
CREATE POLICY "Autenticados suben oc-clientes"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'oc-clientes');

DROP POLICY IF EXISTS "Admins eliminan oc-clientes" ON storage.objects;
CREATE POLICY "Admins eliminan oc-clientes"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'oc-clientes' AND public.has_role(auth.uid(), 'admin'));
