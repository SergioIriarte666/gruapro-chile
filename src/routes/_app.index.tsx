import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

function Dashboard() {
  const { user, roles } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Bienvenido</h2>
        <p className="text-muted-foreground text-sm">
          {user?.email} · Rol(es): {roles.join(", ") || "sin asignar"}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Aquí verás los indicadores principales del negocio. En construcción.
        </CardContent>
      </Card>
    </div>
  );
}
