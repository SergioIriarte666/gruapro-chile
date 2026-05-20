-- Permite que usuarios autenticados vean el historial transversal en la app.
DROP POLICY IF EXISTS "Admins ven historial" ON public.service_change_history;
DROP POLICY IF EXISTS "Autenticados ven historial" ON public.service_change_history;

CREATE POLICY "Autenticados ven historial"
ON public.service_change_history
FOR SELECT
TO authenticated
USING (true);

-- El importador XML guarda URLs públicas en costos.archivo_url, por lo que
-- el bucket debe ser publico para que esos enlaces funcionen.
UPDATE storage.buckets
SET public = true
WHERE id = 'documentos-xml';
