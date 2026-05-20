import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type ConfigComision = Tables<"config_comisiones">;

function ConfiguracionPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("comisiones");

  useEffect(() => {
    const channel = supabase
      .channel("configuracion-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "config_comisiones" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["config_comisiones"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Parámetros del sistema. Algunos cambios aplican solo a operaciones nuevas.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
        </TabsList>
        <TabsContent value="comisiones">
          <ConfigComisionesCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ConfigComisionesCard() {
  const queryClient = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["config_comisiones"],
    queryFn: async (): Promise<ConfigComision[]> => {
      const { data, error } = await supabase
        .from("config_comisiones")
        .select("*")
        .order("tipo_servicio");
      if (error) throw error;
      return (data ?? []) as ConfigComision[];
    },
  });

  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const r of rows) {
      next[r.id] = String(r.monto_comision ?? 0);
    }
    setDraft(next);
  }, [rows]);

  const dirty = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.some((r) => String(r.monto_comision ?? 0) !== (draft[r.id] ?? "0"));
  }, [rows, draft]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const r of rows) {
        const raw = draft[r.id];
        const value = Number(raw ?? 0);
        if (Number.isNaN(value) || value < 0) {
          throw new Error("Monto inválido. Debe ser un número >= 0");
        }
        if (Number(r.monto_comision ?? 0) === value) continue;
        const { error } = await supabase
          .from("config_comisiones")
          .update({ monto_comision: value })
          .eq("id", r.id);
        if (error) throw error;

        const { error: histErr } = await (supabase as any)
          .from("service_change_history")
          .insert({
            entity_type: "config_comisiones",
            entity_id: r.id,
            action: "updated",
            old_value: r,
            new_value: { monto_comision: value },
          });
        if (histErr) throw new Error(histErr.message);
      }
    },
    onSuccess: () => {
      toast.success("Configuración actualizada");
      queryClient.invalidateQueries({ queryKey: ["config_comisiones"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Montos de comisión por tipo de servicio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Los cambios aplican solo a servicios nuevos. Las comisiones ya generadas no se modifican.
        </div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin configuración.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Tipo de servicio</th>
                  <th className="text-right p-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 font-medium">{r.tipo_servicio}</td>
                    <td className="p-2 text-right">
                      <Input
                        className="w-40 ml-auto text-right"
                        type="number"
                        min={0}
                        value={draft[r.id] ?? "0"}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [r.id]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            disabled={!dirty || saveMutation.isPending}
            onClick={() => saveMutation.mutateAsync()}
          >
            {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_app/configuracion")({
  component: ConfiguracionPage,
});
