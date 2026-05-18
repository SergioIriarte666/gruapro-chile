import { useQuery } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LogOut, Truck } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatCLP, formatDateTime } from "@/lib/format";

const ESTADOS = ["pendiente", "en_curso", "completado", "cancelado"] as const;

function useMiOperador(userId: string | undefined) {
  return useQuery({
    queryKey: ["operador-self", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operadores")
        .select("id, nombre")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function useMisOrdenesHoy(operadorId: string | undefined) {
  return useQuery({
    queryKey: ["mis-ordenes-hoy", operadorId],
    enabled: !!operadorId,
    queryFn: async () => {
      const hoy = new Date();
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString();
      const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1).toISOString();
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("id, folio_interno, estado, origen, destino, fecha_servicio, monto, clientes(nombre)")
        .eq("operador_id", operadorId!)
        .gte("fecha_servicio", inicio)
        .lt("fecha_servicio", fin)
        .order("fecha_servicio", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useMisComisionesMes(operadorId: string | undefined) {
  return useQuery({
    queryKey: ["mis-comisiones-mes", operadorId],
    enabled: !!operadorId,
    queryFn: async () => {
      const hoy = new Date();
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString();
      const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1).toISOString();
      const { data, error } = await supabase
        .from("comisiones")
        .select("id, monto_comision, estado, created_at")
        .eq("operador_id", operadorId!)
        .gte("created_at", inicio)
        .lt("created_at", fin);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function OperadorLayout({ children: _ }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { data: operador, isLoading: loadingOp } = useMiOperador(user?.id);
  const { data: ordenes = [] } = useMisOrdenesHoy(operador?.id);
  const { data: comisiones = [] } = useMisComisionesMes(operador?.id);

  const updateEstado = useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: string }) => {
      const { error } = await supabase
        .from("ordenes_servicio")
        .update({ estado })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estado actualizado");
      queryClient.invalidateQueries({ queryKey: ["mis-ordenes-hoy"] });
    },
    onError: (e: any) => toast.error("No se pudo actualizar", { description: e.message }),
  });

  const totalPendiente = comisiones
    .filter((c) => c.estado !== "pagado")
    .reduce((s, c) => s + Number(c.monto_comision ?? 0), 0);
  const totalPagado = comisiones
    .filter((c) => c.estado === "pagado")
    .reduce((s, c) => s + Number(c.monto_comision ?? 0), 0);

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--app-bg)" }}>
      <header className="bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Truck className="h-5 w-5" />
          <h1 className="text-base font-semibold">Mi panel de operador</h1>
          <div className="ml-auto flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <Button
              size="sm"
              variant="ghost"
              className="text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => signOut()}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 space-y-4">
        {loadingOp ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : !operador ? (
          <Card>
            <CardHeader>
              <CardTitle>Cuenta sin vincular</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Tu cuenta aún no está vinculada a un operador. Contacta al administrador para
              que asocie tu usuario a tu ficha de operador.
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Mis órdenes de hoy</CardTitle>
              </CardHeader>
              <CardContent>
                {ordenes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tienes órdenes asignadas hoy.</p>
                ) : (
                  <ul className="divide-y">
                    {ordenes.map((o: any) => (
                      <li key={o.id} className="py-3 flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                          <p className="font-medium">
                            {o.folio_interno ?? "—"} · {o.clientes?.nombre ?? "Cliente"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(o.fecha_servicio)} · {o.origen ?? "?"} → {o.destino ?? "?"}
                          </p>
                        </div>
                        <Badge variant="outline">{o.estado}</Badge>
                        <Select
                          value={o.estado}
                          onValueChange={(estado) =>
                            updateEstado.mutate({ id: o.id, estado })
                          }
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ESTADOS.map((e) => (
                              <SelectItem key={e} value={e}>
                                {e.replace("_", " ")}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mis comisiones del mes</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Pendiente</p>
                  <p className="text-2xl font-bold">{formatCLP(totalPendiente)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pagado</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCLP(totalPagado)}</p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
