import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  BarChart3,
  Box,
  DollarSign,
  Pencil,
  Settings,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCLP, formatDate, formatDateTime } from "@/lib/format";
import { ChangeHistoryPanel } from "@/components/shared/change-history-panel";
import {
  createGruaSchema,
  ESTADO_GRUA_OPTIONS,
  TIPO_GRUA_OPTIONS,
} from "@/lib/validations/gruas";

type Grua = Tables<"gruas">;
type Orden = Tables<"ordenes_servicio"> & { clientes: { nombre: string } | null };
type Costo = Tables<"costos"> & {
  categorias_costo: { nombre: string } | null;
  subcategorias_costo: { nombre: string } | null;
};
type Movimiento = Tables<"bodega_movimientos"> & {
  bodega_items: { nombre: string } | null;
};

function estadoBadgeClass(estado: string | null) {
  if (estado === "activa") return "bg-green-600 text-white border-green-700";
  if (estado === "en_mantencion")
    return "bg-amber-500 text-white border-amber-600";
  return "bg-muted text-muted-foreground";
}

type GruaFormValues = z.input<typeof createGruaSchema>;

export const Route = createFileRoute("/_app/gruas/$gruaId")({
  component: GruaDetailPage,
});

function GruaDetailPage() {
  const { gruaId } = Route.useParams();
  return <GruaDetailView gruaId={gruaId} showBackLink />;
}

export function GruaDetailView({
  gruaId,
  showBackLink = false,
}: {
  gruaId: string;
  showBackLink?: boolean;
}) {
  const queryClient = useQueryClient();
  const [openEdit, setOpenEdit] = useState(false);

  const { data: grua, isLoading } = useQuery({
    queryKey: ["gruas", gruaId],
    queryFn: async () => {
      const { data, error } = await supabase.from("gruas").select("*").eq("id", gruaId).single();
      if (error) throw error;
      return data as Grua;
    },
  });

  const { data: tabCounts } = useQuery({
    queryKey: ["gruas", gruaId, "tab-counts"],
    queryFn: async () => {
      const [
        serviciosRes,
        costosRes,
        piezasRes,
        mantencionesRes,
      ] = await Promise.all([
        supabase
          .from("ordenes_servicio")
          .select("id", { count: "exact", head: true })
          .eq("grua_id", gruaId),
        supabase.from("costos").select("id", { count: "exact", head: true }).eq("grua_id", gruaId),
        supabase
          .from("bodega_movimientos")
          .select("id", { count: "exact", head: true })
          .eq("grua_id", gruaId)
          .eq("tipo", "salida"),
        supabase
          .from("costos")
          .select("id,descripcion,subcategorias_costo(nombre)")
          .eq("grua_id", gruaId),
      ]);

      if (serviciosRes.error) throw serviciosRes.error;
      if (costosRes.error) throw costosRes.error;
      if (piezasRes.error) throw piezasRes.error;
      if (mantencionesRes.error) throw mantencionesRes.error;

      const mantenciones = (mantencionesRes.data ?? []).filter((c: any) => {
        const name = (c.subcategorias_costo?.nombre ?? "").toLowerCase();
        return (
          name.includes("preventiva") ||
          name.includes("correctiva") ||
          name.includes("mantencion") ||
          name.includes("mantención")
        );
      });

      return {
        servicios: serviciosRes.count ?? 0,
        costos: costosRes.count ?? 0,
        piezas: piezasRes.count ?? 0,
        mantenciones: mantenciones.length,
      };
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (values: {
      form: GruaFormValues;
      file: File | null;
    }) => {
      const parsed = createGruaSchema.parse(values.form);

      const { data: before, error: beforeErr } = await supabase
        .from("gruas")
        .select("*")
        .eq("id", gruaId)
        .single();
      if (beforeErr) throw beforeErr;

      if (parsed.estado === "baja") {
        const { count, error: activeErr } = await supabase
          .from("ordenes_servicio")
          .select("id", { count: "exact", head: true })
          .eq("grua_id", gruaId)
          .in("estado", ["pendiente", "en_curso"]);
        if (activeErr) throw activeErr;
        if ((count ?? 0) > 0) {
          throw new Error("No se puede dar de baja una grúa con órdenes activas");
        }
      }

      let fotoUrl: string | null | undefined = undefined;
      if (values.file) {
        const ext = values.file.name.split(".").pop() || "jpg";
        const path = `${parsed.patente}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("fotos-gruas")
          .upload(path, values.file);
        if (upErr) throw upErr;
        fotoUrl = supabase.storage.from("fotos-gruas").getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        marca: parsed.marca || null,
        modelo: parsed.modelo || null,
        anio: parsed.anio ?? null,
        tipo_grua: parsed.tipo_grua,
        estado: parsed.estado,
        fecha_incorporacion: parsed.fecha_incorporacion || null,
        ...(fotoUrl !== undefined ? { foto_url: fotoUrl } : {}),
      };

      const { error } = await supabase.from("gruas").update(payload).eq("id", gruaId);
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "grua",
          entity_id: gruaId,
          action: "updated",
          old_value: before,
          new_value: payload,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Grúa actualizada");
      setOpenEdit(false);
      queryClient.invalidateQueries({ queryKey: ["gruas"] });
      queryClient.invalidateQueries({ queryKey: ["gruas", gruaId] });
      queryClient.invalidateQueries({ queryKey: ["gruas", "activas"] });
      queryClient.invalidateQueries({ queryKey: ["gruas-min"] });
      queryClient.invalidateQueries({ queryKey: ["flota-estados"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Cargando grúa...</div>;
  }
  if (!grua) {
    return <div className="text-muted-foreground">Grúa no encontrada.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {showBackLink ? (
            <Button asChild variant="ghost" size="icon">
              <Link to="/gruas">
                <ArrowLeft />
              </Link>
            </Button>
          ) : null}
          <div>
            <h1 className="text-2xl font-semibold">{grua.patente}</h1>
            <p className="text-sm text-muted-foreground">
              {(grua.marca ?? "—") + " " + (grua.modelo ?? "")} · {grua.anio ?? "—"}
            </p>
          </div>
          <Badge className={estadoBadgeClass(grua.estado)}>
            {(grua.estado ?? "activa").replaceAll("_", " ")}
          </Badge>
        </div>
        <Button variant="outline" onClick={() => setOpenEdit(true)}>
          <Pencil /> Editar
        </Button>
      </div>

      {grua.foto_url ? (
        <Card className="overflow-hidden">
          <img src={grua.foto_url} alt={grua.patente} className="w-full h-56 object-cover" />
        </Card>
      ) : null}

      <Tabs defaultValue="resumen">
        <TabsList className="w-full justify-start flex-wrap gap-2 bg-transparent p-0">
          <TabsTrigger
            value="resumen"
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="ml-2">Resumen</span>
          </TabsTrigger>
          <TabsTrigger
            value="servicios"
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md"
          >
            <Wrench className="h-4 w-4" />
            <span className="ml-2">Servicios</span>
            <span className="ml-2 rounded-full border px-2 py-0.5 text-xs data-[state=active]:border-white/30">
              {tabCounts?.servicios ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="costos"
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md"
          >
            <DollarSign className="h-4 w-4" />
            <span className="ml-2">Costos</span>
            <span className="ml-2 rounded-full border px-2 py-0.5 text-xs data-[state=active]:border-white/30">
              {tabCounts?.costos ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="piezas"
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md"
          >
            <Box className="h-4 w-4" />
            <span className="ml-2">Piezas</span>
            <span className="ml-2 rounded-full border px-2 py-0.5 text-xs data-[state=active]:border-white/30">
              {tabCounts?.piezas ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="mant"
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md"
          >
            <Settings className="h-4 w-4" />
            <span className="ml-2">Mant.</span>
            <span className="ml-2 rounded-full border px-2 py-0.5 text-xs data-[state=active]:border-white/30">
              {tabCounts?.mantenciones ?? 0}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="inventario"
            className="data-[state=active]:bg-purple-600 data-[state=active]:text-white rounded-md"
          >
            <Warehouse className="h-4 w-4" />
            <span className="ml-2">Inventario</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <ResumenTab grua={grua} />
        </TabsContent>
        <TabsContent value="servicios">
          <ServiciosTab gruaId={gruaId} />
        </TabsContent>
        <TabsContent value="costos">
          <CostosTab gruaId={gruaId} />
        </TabsContent>
        <TabsContent value="piezas">
          <PiezasTab gruaId={gruaId} />
        </TabsContent>
        <TabsContent value="mant">
          <MantencionesTab gruaId={gruaId} />
        </TabsContent>
        <TabsContent value="inventario">
          <InventarioTab gruaId={gruaId} />
        </TabsContent>
      </Tabs>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar grúa</DialogTitle>
            <DialogDescription>{grua.patente}</DialogDescription>
          </DialogHeader>
          <GruaEditForm
            initial={{
              patente: grua.patente,
              marca: grua.marca ?? "",
              modelo: grua.modelo ?? "",
              anio: grua.anio ?? undefined,
              tipo_grua: (grua.tipo_grua as any) ?? "otro",
              estado: (grua.estado as any) ?? "activa",
              fecha_incorporacion: grua.fecha_incorporacion ?? "",
            }}
            existingFotoUrl={grua.foto_url ?? null}
            isSubmitting={updateMutation.isPending}
            onCancel={() => setOpenEdit(false)}
            onSubmit={(form, file) => updateMutation.mutateAsync({ form, file })}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="text-sm mt-1">{value || "—"}</div>
    </div>
  );
}

function ResumenTab({ grua }: { grua: Grua }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
        <Field label="Patente" value={<span className="uppercase font-medium">{grua.patente}</span>} />
        <Field label="Estado" value={(grua.estado ?? "activa").replaceAll("_", " ")} />
        <Field label="Tipo" value={(grua.tipo_grua ?? "—").replaceAll("_", " ")} />
        <Field label="Marca" value={grua.marca} />
        <Field label="Modelo" value={grua.modelo} />
        <Field label="Año" value={grua.anio ?? "—"} />
        <Field label="Fecha incorporación" value={grua.fecha_incorporacion ? formatDate(grua.fecha_incorporacion) : "—"} />
      </CardContent>
    </Card>
  );
}

function ServiciosTab({ gruaId }: { gruaId: string }) {
  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ["gruas", gruaId, "servicios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("id,folio_interno,tipo_servicio,monto,estado,fecha_servicio,clientes(nombre)")
        .eq("grua_id", gruaId)
        .order("fecha_servicio", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as Orden[];
    },
  });

  const totalServicios = ordenes.length;
  const totalIngresos = ordenes.reduce((s, o) => s + Number(o.monto ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Historial de servicios</CardTitle>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="font-semibold">{totalServicios} · {formatCLP(totalIngresos)}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : ordenes.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin servicios.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Folio</th>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-right p-2">Monto</th>
                  <th className="text-left p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {ordenes.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2 font-medium">
                      <Link to="/ordenes/$ordenId" params={{ ordenId: o.id }}>
                        {o.folio_interno ?? "—"}
                      </Link>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {formatDateTime(o.fecha_servicio)}
                    </td>
                    <td className="p-2">{o.clientes?.nombre ?? "—"}</td>
                    <td className="p-2">{o.tipo_servicio ?? "—"}</td>
                    <td className="p-2 text-right">{formatCLP(o.monto)}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="capitalize">
                        {o.estado ?? "—"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostosTab({ gruaId }: { gruaId: string }) {
  const { data: costos = [], isLoading } = useQuery({
    queryKey: ["gruas", gruaId, "costos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos")
        .select("fecha,monto,descripcion,categorias_costo(nombre),subcategorias_costo(nombre)")
        .eq("grua_id", gruaId)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Costo[];
    },
  });

  const totalCostos = costos.reduce((s, c) => s + Number(c.monto ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Costos</CardTitle>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="font-semibold">{formatCLP(totalCostos)}</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : (
          <>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Fecha</th>
                    <th className="text-left p-2">Categoría</th>
                    <th className="text-left p-2">Subcategoría</th>
                    <th className="text-left p-2">Descripción</th>
                    <th className="text-right p-2">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {costos.slice(0, 50).map((c, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2 text-muted-foreground">{formatDate(c.fecha)}</td>
                      <td className="p-2">{c.categorias_costo?.nombre ?? "—"}</td>
                      <td className="p-2">{c.subcategorias_costo?.nombre ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{c.descripcion ?? "—"}</td>
                      <td className="p-2 text-right font-medium">{formatCLP(c.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function MantencionesTab({ gruaId }: { gruaId: string }) {
  const { data: costos = [], isLoading: loadingCostos } = useQuery({
    queryKey: ["gruas", gruaId, "mantenciones-costos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos")
        .select("fecha,monto,descripcion,subcategorias_costo(nombre)")
        .eq("grua_id", gruaId)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const mantenciones = useMemo(() => {
    return (costos as any[]).filter((c) => {
      const name = (c.subcategorias_costo?.nombre ?? "").toLowerCase();
      return name.includes("preventiva") || name.includes("correctiva") || name.includes("mantencion") || name.includes("mantención");
    });
  }, [costos]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mantenciones</CardTitle>
      </CardHeader>
      <CardContent>
        {loadingCostos ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : mantenciones.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin mantenciones registradas.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Descripción</th>
                  <th className="text-right p-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {mantenciones.slice(0, 50).map((c: any, idx: number) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2 text-muted-foreground">{formatDate(c.fecha)}</td>
                    <td className="p-2">{c.subcategorias_costo?.nombre ?? "—"}</td>
                    <td className="p-2 text-muted-foreground">{c.descripcion ?? "—"}</td>
                    <td className="p-2 text-right font-medium">{formatCLP(c.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PiezasTab({ gruaId }: { gruaId: string }) {
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["gruas", gruaId, "piezas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bodega_movimientos")
        .select("fecha,cantidad,descripcion,bodega_items(nombre)")
        .eq("grua_id", gruaId)
        .eq("tipo", "salida")
        .order("fecha", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Movimiento[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Piezas</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : movimientos.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin movimientos de bodega.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Ítem</th>
                  <th className="text-right p-2">Cantidad</th>
                  <th className="text-left p-2">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{formatDate(m.fecha ?? "")}</td>
                    <td className="p-2">{m.bodega_items?.nombre ?? "—"}</td>
                    <td className="p-2 text-right font-medium">{m.cantidad}</td>
                    <td className="p-2 text-muted-foreground">{m.descripcion ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InventarioTab({ gruaId }: { gruaId: string }) {
  const { data: movimientos = [], isLoading } = useQuery({
    queryKey: ["gruas", gruaId, "inventario"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bodega_movimientos")
        .select("id,fecha,tipo,cantidad,descripcion,bodega_items(nombre)")
        .eq("grua_id", gruaId)
        .order("fecha", { ascending: false })
        .limit(150);
      if (error) throw error;
      return (data ?? []) as unknown as (Movimiento & { tipo: string | null })[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inventario</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : movimientos.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin movimientos asociados a esta grúa.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Ítem</th>
                  <th className="text-right p-2">Cantidad</th>
                  <th className="text-left p-2">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{formatDate(m.fecha ?? "")}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="capitalize">
                        {(m as any).tipo ?? "—"}
                      </Badge>
                    </td>
                    <td className="p-2">{m.bodega_items?.nombre ?? "—"}</td>
                    <td className="p-2 text-right font-medium">{m.cantidad}</td>
                    <td className="p-2 text-muted-foreground">{m.descripcion ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GruaEditForm({
  initial,
  existingFotoUrl,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  initial: GruaFormValues;
  existingFotoUrl: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: GruaFormValues, file: File | null) => Promise<void> | void;
}) {
  const form = useForm<GruaFormValues>({
    resolver: zodResolver(createGruaSchema),
    defaultValues: initial,
  });
  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return existingFotoUrl;
  }, [file, existingFotoUrl]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => onSubmit(v, file))}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <FormField
          control={form.control}
          name="patente"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Patente</FormLabel>
              <FormControl>
                <Input readOnly className="uppercase" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tipo_grua"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de grúa</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TIPO_GRUA_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="estado"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ESTADO_GRUA_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e.replaceAll("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="fecha_incorporacion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha incorporación</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="marca"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Marca</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="modelo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Modelo</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="anio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Año</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1990}
                  max={2030}
                  value={field.value == null ? "" : String(field.value)}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="md:col-span-2 space-y-2">
          <Label>Foto</Label>
          <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {previewUrl ? (
            <div className="rounded-md border overflow-hidden">
              <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover" />
            </div>
          ) : null}
        </div>

        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
