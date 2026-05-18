import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/layout/admin-layout";
import { OperadorLayout } from "@/components/layout/operador-layout";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading, isAdmin, isContador, isOperador, rolesError } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/login" });
    }
  }, [loading, session, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!session) return null;

  if (rolesError) {
    const isMissingRolesTable = rolesError.includes("Could not find the table 'public.user_roles'");
    const isMissingAdminKey = rolesError.includes("SUPABASE_SECRET_KEY") || rolesError.includes("SUPABASE_SERVICE_ROLE_KEY");
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "var(--app-bg)" }}
      >
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">
            {isMissingRolesTable
              ? "La base de datos aún no está inicializada"
              : isMissingAdminKey
                ? "Falta configurar la key secreta del servidor"
              : "No se pudieron cargar los roles"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isMissingRolesTable
              ? "Ejecuta las migraciones de Supabase (carpeta supabase/migrations) y vuelve a iniciar sesión."
              : isMissingAdminKey
                ? "Agrega SUPABASE_SECRET_KEY (sb_secret_...) en el entorno del servidor, o asigna el rol manualmente en public.user_roles."
              : rolesError}
          </p>
        </div>
      </div>
    );
  }

  // Rol operador (sin admin/contador) → layout simplificado
  if (isOperador && !isAdmin && !isContador) {
    return (
      <OperadorLayout>
        <Outlet />
      </OperadorLayout>
    );
  }

  // Admin o contador → layout completo con sidebar
  if (isAdmin || isContador) {
    return (
      <AdminLayout>
        <Outlet />
      </AdminLayout>
    );
  }

  // Sin rol asignado
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--app-bg)" }}>
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">Tu cuenta aún no tiene un rol asignado</h1>
        <p className="text-sm text-muted-foreground">
          Contacta al administrador del sistema para que te asigne un rol y puedas acceder.
        </p>
      </div>
    </div>
  );
}
