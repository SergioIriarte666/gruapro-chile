import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Pencil } from "lucide-react";
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
import { createOperadorSchema } from "@/lib/validations/operadores";

type Operador = Tables<"operadores">;
type Orden = Tables<"ordenes_servicio"> & { clientes: { nombre: string } | null };
type ComisionRow = Tables<"comisiones"> & {
  ordenes_servicio: Pick<
    Tables<"ordenes_servicio">,
    "id" | "folio_interno" | "tipo_servicio" | "fecha_servicio"
  > & { clientes?: { nombre: string } | null };
};
type CostoRow = Tables<"costos"> & {
  categorias_costo: { nombre: string } | null;
  subcategorias_costo: { nombre: string } | null;
  ordenes_servicio: Pick<Tables<"ordenes_servicio">, "id" | "folio_interno" | "operador_id"> | null;
};

type OperadorFormValues = z.input<typeof createOperadorSchema>;

export const Route = createFileRoute("/_app/operadores/$operadorId")({
  component: OperadorDetailPage,
});

function estadoVariant(estado: string | null) {
  if (estado === "activo") return "default" as const;
  if (estado === "vacaciones") return "secondary" as const;
  return "outline" as const;
}

function licenciaStatus(vencimiento: string | null) {
  if (!vencimiento) return { kind: "none" as const, days: null };
  const d = new Date(vencimiento);
  if (Number.isNaN(d.getTime())) return { kind: "none" as const, days: null };
  const days = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { kind: "expired" as const, days };
  if (days <= 30) return { kind: "soon" as const, days };
  return { kind: "ok" as const, days };
}

function periodoRange(periodo: "semana" | "mes" | "anio") {
  const fin = new Date();
  const inicio = new Date();
  if (periodo === "semana") inicio.setDate(inicio.getDate() - 7);
  if (periodo === "mes") inicio.setMonth(inicio.getMonth() - 1);
  if (periodo === "anio") inicio.setFullYear(inicio.getFullYear() - 1);
  return { inicioISO: inicio.toISOString(), finISO: fin.toISOString(), inicio, fin };
}

function OperadorDetailPage() {
  const { operadorId } = Route.useParams();
  const queryClient = useQueryClient();
  const [openEdit, setOpenEdit] = useState(false);

  const { data: operador, isLoading } = useQuery({
    queryKey: ["operadores", operadorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operadores")
        .select("*")
        .eq("id", operadorId)
        .single();
      if (error) throw error;
      return data as Operador;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`operador-${operadorId}-realtime`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "operadores", filter: `id=eq.${operadorId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["operadores"] });
          queryClient.invalidateQueries({ queryKey: ["operadores", operadorId] });
          queryClient.invalidateQueries({ queryKey: ["operadores", "activos"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comisiones", filter: `operador_id=eq.${operadorId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["comisiones"] });
          queryClient.invalidateQueries({ queryKey: ["operadores", operadorId, "comisiones"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordenes_servicio", filter: `operador_id=eq.${operadorId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["operadores", operadorId, "servicios"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [operadorId, queryClient]);

  const updateMutation = useMutation({
    mutationFn: async (values: OperadorFormValues) => {
      const parsed = createOperadorSchema.parse(values);
      const { data: before, error: beforeErr } = await supabase
        .from("operadores")
        .select("*")
        .eq("id", operadorId)
        .single();
      if (beforeErr) throw beforeErr;

      if (before.estado === "activo" && parsed.estado !== "activo") {
        const { count, error: activeErr } = await supabase
          .from("ordenes_servicio")
          .select("id", { count: "exact", head: true })
          .eq("operador_id", operadorId)
          .in("estado", ["pendiente", "en_curso"]);
        if (activeErr) throw activeErr;
        if ((count ?? 0) > 0) {
          throw new Error("No se puede inactivar: tiene órdenes activas");
        }
      }

      const payload = {
        nombre: parsed.nombre,
        rut: parsed.rut || null,
        telefono: parsed.telefono || null,
        licencia_clase: parsed.licencia_clase ?? null,
        licencia_vencimiento: parsed.licencia_vencimiento || null,
        tipo_contrato: parsed.tipo_contrato,
        sueldo_base: Number(parsed.sueldo_base ?? 0),
        estado: parsed.estado,
      };

      const { error } = await supabase
        .from("operadores")
        .update(payload)
        .eq("id", operadorId);
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "operador",
          entity_id: operadorId,
          action: "updated",
          old_value: before,
          new_value: payload,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Operador actualizado");
      setOpenEdit(false);
      queryClient.invalidateQueries({ queryKey: ["operadores"] });
      queryClient.invalidateQueries({ queryKey: ["operadores", operadorId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-muted-foreground">Cargando operador...</div>;
  if (!operador) return <div className="text-muted-foreground">Operador no encontrado.</div>;

  const lic = licenciaStatus(operador.licencia_vencimiento);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/operadores">
              <ArrowLeft />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{operador.nombre}</h1>
            <p className="text-sm text-muted-foreground">{operador.rut ?? "Sin RUT"}</p>
          </div>
          <Badge variant={estadoVariant(operador.estado)} className="capitalize">
            {operador.estado ?? "—"}
          </Badge>
          {lic.kind === "expired" ? (
            <Badge variant="destructive">Licencia vencida</Badge>
          ) : lic.kind === "soon" ? (
            <Badge variant="secondary">Licencia por vencer</Badge>
          ) : null}
        </div>
        <Button variant="outline" onClick={() => setOpenEdit(true)}>
          <Pencil /> Editar
        </Button>
      </div>

      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="costos">Costos</TabsTrigger>
          <TabsTrigger value="comisiones">Comisiones</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="datos">
          <DatosTab operador={operador} />
        </TabsContent>
        <TabsContent value="servicios">
          <ServiciosTab operadorId={operadorId} />
        </TabsContent>
        <TabsContent value="costos">
          <CostosTab operadorId={operadorId} />
        </TabsContent>
        <TabsContent value="comisiones">
          <ComisionesTab operadorId={operadorId} operadorNombre={operador.nombre} />
        </TabsContent>
        <TabsContent value="historial">
          <ChangeHistoryPanel entityType="operador" entityId={operadorId} />
        </TabsContent>
      </Tabs>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar operador</DialogTitle>
            <DialogDescription>{operador.nombre}</DialogDescription>
          </DialogHeader>
          <OperadorEditForm
            initial={{
              nombre: operador.nombre,
              rut: operador.rut ?? "",
              telefono: operador.telefono ?? "",
              licencia_clase: (operador.licencia_clase as any) ?? undefined,
              licencia_vencimiento: operador.licencia_vencimiento ?? "",
              tipo_contrato: (operador.tipo_contrato as any) ?? "planta",
              sueldo_base: Number(operador.sueldo_base ?? 0),
              estado: (operador.estado as any) ?? "activo",
            }}
            isSubmitting={updateMutation.isPending}
            onCancel={() => setOpenEdit(false)}
            onSubmit={(v) => updateMutation.mutateAsync(v)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm mt-1">{value || "—"}</div>
    </div>
  );
}

function DatosTab({ operador }: { operador: Operador }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
        <Field label="Nombre" value={operador.nombre} />
        <Field label="RUT" value={operador.rut} />
        <Field label="Teléfono" value={operador.telefono} />
        <Field label="Contrato" value={<span className="capitalize">{operador.tipo_contrato ?? "—"}</span>} />
        <Field label="Sueldo base" value={formatCLP(Number(operador.sueldo_base ?? 0))} />
        <Field label="Licencia" value={operador.licencia_clase ?? "—"} />
        <Field label="Vencimiento licencia" value={operador.licencia_vencimiento ? formatDate(operador.licencia_vencimiento) : "—"} />
        <Field label="Estado" value={<span className="capitalize">{operador.estado ?? "—"}</span>} />
      </CardContent>
    </Card>
  );
}

function ServiciosTab({ operadorId }: { operadorId: string }) {
  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ["operadores", operadorId, "servicios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("id,folio_interno,tipo_servicio,monto,estado,fecha_servicio,clientes(nombre)")
        .eq("operador_id", operadorId)
        .order("fecha_servicio", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as unknown as Orden[];
    },
  });

  const totalServicios = ordenes.length;
  const totalIngresos = ordenes.reduce((s, o) => s + Number(o.monto ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Servicios</CardTitle>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total</div>
          <div className="font-semibold">
            {totalServicios} · {formatCLP(totalIngresos)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
                    <td className="p-2 text-muted-foreground">{formatDateTime(o.fecha_servicio)}</td>
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

function CostosTab({ operadorId }: { operadorId: string }) {
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "anio">("mes");
  const r = useMemo(() => periodoRange(periodo), [periodo]);

  const inicioFecha = r.inicio.toISOString().slice(0, 10);
  const finFecha = r.fin.toISOString().slice(0, 10);

  const { data: costos = [], isLoading } = useQuery({
    queryKey: ["operadores", operadorId, "costos", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos")
        .select(
          "id,fecha,monto,tipo,medio_pago,numero_documento,descripcion, categorias_costo(nombre), subcategorias_costo(nombre), ordenes_servicio!inner(id,folio_interno,operador_id)",
        )
        .eq("tipo", "servicio")
        .eq("ordenes_servicio.operador_id", operadorId)
        .gte("fecha", inicioFecha)
        .lte("fecha", finFecha)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CostoRow[];
    },
  });

  const { data: ingresos = 0 } = useQuery({
    queryKey: ["operadores", operadorId, "ingresos", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("monto,estado")
        .eq("operador_id", operadorId)
        .gte("fecha_servicio", r.inicioISO)
        .lte("fecha_servicio", r.finISO)
        .in("estado", ["completado", "facturado"]);
      if (error) throw error;
      return (data ?? []).reduce((s: number, o: any) => s + Number(o.monto ?? 0), 0);
    },
  });

  const totalCostos = costos.reduce((s, c) => s + Number(c.monto ?? 0), 0);
  const margen = Number(ingresos) - totalCostos;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Costos directos del operador</CardTitle>
        <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semana">Últimos 7 días</SelectItem>
            <SelectItem value="mes">Últimos 30 días</SelectItem>
            <SelectItem value="anio">Último año</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Ingresos (completado/facturado)</div>
            <div className="text-lg font-semibold">{formatCLP(Number(ingresos))}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Costos directos</div>
            <div className="text-lg font-semibold">{formatCLP(totalCostos)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Margen (ingresos - costos)</div>
            <div className="text-lg font-semibold">{formatCLP(margen)}</div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : costos.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin costos directos en el período.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Categoría</th>
                  <th className="text-left p-2">Descripción</th>
                  <th className="text-left p-2">Doc.</th>
                  <th className="text-left p-2">Orden</th>
                  <th className="text-right p-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {costos.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{formatDate(c.fecha)}</td>
                    <td className="p-2">
                      {(c.categorias_costo?.nombre ?? "—") +
                        (c.subcategorias_costo?.nombre
                          ? ` → ${c.subcategorias_costo.nombre}`
                          : "")}
                    </td>
                    <td className="p-2 text-muted-foreground">{c.descripcion ?? "—"}</td>
                    <td className="p-2">{c.numero_documento ?? "—"}</td>
                    <td className="p-2">
                      {c.ordenes_servicio?.id ? (
                        <Link
                          to="/ordenes/$ordenId"
                          params={{ ordenId: c.ordenes_servicio.id }}
                        >
                          {c.ordenes_servicio.folio_interno ?? "Ver orden"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-2 text-right">{formatCLP(c.monto)}</td>
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

function ComisionesTab({
  operadorId,
  operadorNombre,
}: {
  operadorId: string;
  operadorNombre: string;
}) {
  const queryClient = useQueryClient();
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "anio">("mes");
  const [openLiquidar, setOpenLiquidar] = useState(false);

  const r = useMemo(() => periodoRange(periodo), [periodo]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["operadores", operadorId, "comisiones", periodo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comisiones")
        .select("*, ordenes_servicio(id,folio_interno,tipo_servicio,fecha_servicio, clientes(nombre))")
        .eq("operador_id", operadorId)
        .gte("created_at", r.inicioISO)
        .lte("created_at", r.finISO)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ComisionRow[];
    },
  });

  const totPendiente = rows
    .filter((c) => c.estado === "pendiente")
    .reduce((s, c) => s + Number(c.monto_comision ?? 0), 0);
  const totPagado = rows
    .filter((c) => c.estado === "pagado")
    .reduce((s, c) => s + Number(c.monto_comision ?? 0), 0);

  const liquidarMutation = useMutation({
    mutationFn: async (values: { fecha_pago: string; medio_pago: string; referencia: string }) => {
      const inicio = r.inicioISO;
      const fin = r.finISO;
      const { data: pend, error: selErr } = await supabase
        .from("comisiones")
        .select("id")
        .eq("operador_id", operadorId)
        .eq("estado", "pendiente")
        .gte("created_at", inicio)
        .lte("created_at", fin);
      if (selErr) throw selErr;
      const ids = (pend ?? []).map((x: any) => x.id);
      if (ids.length === 0) {
        throw new Error("No hay comisiones pendientes en el período");
      }

      const { error } = await supabase
        .from("comisiones")
        .update({ estado: "pagado", fecha_pago: values.fecha_pago || new Date().toISOString().slice(0, 10) })
        .in("id", ids)
        .eq("estado", "pendiente");
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "operador",
          entity_id: operadorId,
          action: "liquidacion_comisiones",
          new_value: {
            periodo,
            inicio,
            fin,
            medio_pago: values.medio_pago,
            referencia: values.referencia || null,
            total: totPendiente,
            cantidad: ids.length,
          },
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Comisiones liquidadas");
      setOpenLiquidar(false);
      queryClient.invalidateQueries({ queryKey: ["comisiones"] });
      queryClient.invalidateQueries({ queryKey: ["operadores", operadorId, "comisiones"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Comisiones</CardTitle>
        <div className="flex gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="mes">Mes</SelectItem>
              <SelectItem value="anio">Año</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={totPendiente <= 0}
            onClick={() => setOpenLiquidar(true)}
          >
            Liquidar período
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Pendiente</div>
              <div className="text-2xl font-semibold text-destructive">{formatCLP(totPendiente)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Pagado</div>
              <div className="text-2xl font-semibold">{formatCLP(totPagado)}</div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin comisiones en el período.</div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Fecha</th>
                  <th className="text-left p-2">Orden</th>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-left p-2">Cliente</th>
                  <th className="text-right p-2">Monto</th>
                  <th className="text-left p-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{formatDateTime(c.created_at)}</td>
                    <td className="p-2 font-medium">
                      <Link to="/ordenes/$ordenId" params={{ ordenId: c.orden_id }}>
                        {c.ordenes_servicio?.folio_interno ?? "—"}
                      </Link>
                    </td>
                    <td className="p-2">{c.ordenes_servicio?.tipo_servicio ?? "—"}</td>
                    <td className="p-2">{(c.ordenes_servicio as any)?.clientes?.nombre ?? "—"}</td>
                    <td className="p-2 text-right font-medium">{formatCLP(c.monto_comision)}</td>
                    <td className="p-2">
                      <Badge variant={c.estado === "pagado" ? "default" : "outline"} className="capitalize">
                        {c.estado ?? "—"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={openLiquidar} onOpenChange={setOpenLiquidar}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Liquidar comisiones</DialogTitle>
            <DialogDescription>
              {operadorNombre} · {periodo} · {formatCLP(totPendiente)}
            </DialogDescription>
          </DialogHeader>
          <LiquidacionForm
            isSubmitting={liquidarMutation.isPending}
            onCancel={() => setOpenLiquidar(false)}
            onSubmit={(v) => liquidarMutation.mutateAsync(v)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function OperadorEditForm({
  initial,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  initial: OperadorFormValues;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: OperadorFormValues) => Promise<void> | void;
}) {
  const form = useForm<OperadorFormValues>({
    resolver: zodResolver(createOperadorSchema),
    defaultValues: initial,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Nombre *</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rut"
          render={({ field }) => (
            <FormItem>
              <FormLabel>RUT</FormLabel>
              <FormControl>
                <Input placeholder="12.345.678-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="telefono"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Teléfono</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="licencia_clase"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Clase licencia</FormLabel>
              <Select
                value={field.value ?? "__none__"}
                onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">Sin clase</SelectItem>
                  {["A1", "A2", "A3", "A4", "A5"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
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
          name="licencia_vencimiento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vencimiento licencia</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tipo_contrato"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo contrato *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {[
                    { v: "planta", l: "Planta" },
                    { v: "honorarios", l: "Honorarios" },
                    { v: "externo", l: "Externo" },
                  ].map((o) => (
                    <SelectItem key={o.v} value={o.v}>
                      {o.l}
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
          name="sueldo_base"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sueldo base</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  value={field.value == null ? "" : String(field.value)}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
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
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="vacaciones">Vacaciones</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function LiquidacionForm({
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: { fecha_pago: string; medio_pago: string; referencia: string }) => Promise<void> | void;
}) {
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().slice(0, 10));
  const [medio, setMedio] = useState("transferencia");
  const [referencia, setReferencia] = useState("");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Fecha pago</Label>
          <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
        </div>
        <div>
          <Label>Medio de pago</Label>
          <Select value={medio} onValueChange={setMedio}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="transferencia">Transferencia</SelectItem>
              <SelectItem value="efectivo">Efectivo</SelectItem>
              <SelectItem value="cheque">Cheque</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Referencia</Label>
        <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° transferencia / folio..." />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={isSubmitting}
          onClick={() => onSubmit({ fecha_pago: fechaPago, medio_pago: medio, referencia })}
        >
          {isSubmitting ? "Procesando..." : "Confirmar liquidación"}
        </Button>
      </div>
    </div>
  );
}
