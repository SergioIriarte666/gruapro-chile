
-- Fijar search_path en is_authenticated
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
$$;

-- Revocar EXECUTE público en funciones SECURITY DEFINER internas
REVOKE EXECUTE ON FUNCTION public.genera_folio() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_folio_orden() FROM PUBLIC, anon, authenticated;

-- has_role es usada en políticas RLS por usuarios autenticados → mantener authenticated, revocar anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
