import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  estadoCierreLabel,
  estadoCierreVariant,
  calcTotales,
} from "@/lib/cierres-options";
import { formatCLP, formatDate } from "@/lib/format";
import { ChangeHistoryPanel } from "@/components/shared/change-history-panel";
import { registrarFacturaSchema, registrarFolioSchema, registrarPagoSchema } from "@/lib/validations/cierres";

export const Route = createFileRoute("/_app/cierres/$cierreId")({
  component: CierreDetalle,
});

type Cierre = {
  id: string;
  numero: string | null;
  estado: string | null;
  cliente_id: string;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  folio_cliente: string | null;
  folio_fecha_recepcion: string | null;
  folio_vencimiento: string | null;
  factura_folio_sii: string | null;
  factura_fecha: string | null;
  pago_fecha: string | null;
  pago_monto: number | null;
  pago_medio: string | null;
  pago_referencia: string | null;
  created_at: string | null;
  updated_at: string | null;
  clientes: {
    nombre: string;
    rut: string | null;
    direccion: string | null;
    email: string | null;
    requiere_folio: boolean | null;
    iva_incluido: boolean | null;
    condicion_pago: number | null;
  } | null;
};

type Servicio = {
  id: string;
  monto_aplicado: number | null;
  ordenes_servicio: {
    id: string;
    folio_interno: string | null;
    folio_cliente: string | null;
    tipo_servicio: string | null;
    fecha_servicio: string | null;
    monto: number | null;
    origen: string | null;
    destino: string | null;
    clientes_vehiculos: { patente: string | null } | null;
  } | null;
};

type ServicioDisponible = {
  id: string;
  folio_interno: string | null;
  folio_cliente: string | null;
  tipo_servicio: string | null;
  monto: number | null;
  fecha_servicio: string | null;
  clientes_vehiculos: { patente: string | null } | null;
};

function CierreDetalle() {
  const { cierreId } = Route.useParams();
  const queryClient = useQueryClient();

  const [folioInput, setFolioInput] = useState("");
  const [folioFecha, setFolioFecha] = useState(new Date().toISOString().slice(0, 10));
  const [folioVenc, setFolioVenc] = useState(new Date().toISOString().slice(0, 10));
  const [facturaFolio, setFacturaFolio] = useState("");
  const [facturaFecha, setFacturaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [pagoMedio, setPagoMedio] = useState<string>("transferencia");
  const [pagoRef, setPagoRef] = useState("");

  const [tab, setTab] = useState<"detalle" | "historial">("detalle");
  const [openAdd, setOpenAdd] = useState(false);
  const [addSeleccionados, setAddSeleccionados] = useState<Record<string, boolean>>({});

  const { data: cierre, isLoading } = useQuery({
    queryKey: ["cierre", cierreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("*, clientes(nombre,rut,direccion,email,requiere_folio,iva_incluido,condicion_pago)")
        .eq("id", cierreId)
        .single();
      if (error) throw error;
      return data as Cierre;
    },
  });

  useEffect(() => {
    if (!cierre) return;
    setFolioInput(cierre.folio_cliente ?? "");
    setFolioFecha((cierre.folio_fecha_recepcion ?? new Date().toISOString()).slice(0, 10));
    setFolioVenc((cierre.folio_vencimiento ?? new Date().toISOString()).slice(0, 10));
    setFacturaFolio(cierre.factura_folio_sii ?? "");
    setFacturaFecha((cierre.factura_fecha ?? new Date().toISOString()).slice(0, 10));
    setPagoMonto(cierre.pago_monto != null ? String(cierre.pago_monto) : "");
    setPagoFecha((cierre.pago_fecha ?? new Date().toISOString()).slice(0, 10));
    setPagoMedio((cierre.pago_medio as any) ?? "transferencia");
    setPagoRef(cierre.pago_referencia ?? "");
  }, [cierre]);

  const { data: servicios = [] } = useQuery({
    queryKey: ["cierre-servicios", cierreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierre_servicios")
        .select(
          "id,monto_aplicado,ordenes_servicio(id,folio_interno,folio_cliente,tipo_servicio,fecha_servicio,monto,origen,destino,clientes_vehiculos(patente))",
        )
        .eq("cierre_id", cierreId);
      if (error) throw error;
      return (data ?? []) as unknown as Servicio[];
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["cierre", cierreId] });
    queryClient.invalidateQueries({ queryKey: ["cierre-servicios", cierreId] });
    queryClient.invalidateQueries({ queryKey: ["cierres"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const montoServicios = useMemo(() => {
    return servicios.reduce(
      (acc, s) => acc + Number(s.monto_aplicado ?? s.ordenes_servicio?.monto ?? 0),
      0,
    );
  }, [servicios]);

  const ivaIncluido = cierre?.clientes?.iva_incluido ?? true;
  const totalesCalc = useMemo(
    () => calcTotales(montoServicios, ivaIncluido),
    [montoServicios, ivaIncluido],
  );

  const updateCierreWithAudit = async (patch: Record<string, unknown>, action: string) => {
    const { data: before, error: beforeErr } = await supabase
      .from("cierres")
      .select("*")
      .eq("id", cierreId)
      .single();
    if (beforeErr) throw beforeErr;

    const { error } = await supabase.from("cierres").update(patch as never).eq("id", cierreId);
    if (error) throw error;

    const { error: histErr } = await (supabase as any).from("service_change_history").insert({
      entity_type: "cierre",
      entity_id: cierreId,
      action,
      old_value: before,
      new_value: patch,
    });
    if (histErr) throw new Error(histErr.message);
  };

  const enviar = useMutation({
    mutationFn: async () => {
      if (!cierre) throw new Error("Cierre no cargado");
      if ((cierre.estado ?? "abierto") !== "abierto")
        throw new Error("Solo se puede enviar desde estado abierto");
      if (servicios.length === 0) throw new Error("Agrega al menos un servicio antes de enviar");
      await updateCierreWithAudit({ estado: "enviado" }, "estado_changed");
    },
    onSuccess: () => {
      toast.success("Cierre enviado");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registrarFolio = useMutation({
    mutationFn: async () => {
      if (!cierre) throw new Error("Cierre no cargado");
      if ((cierre.estado ?? "") !== "enviado")
        throw new Error("Solo puedes registrar folio desde estado enviado");
      const requiere = Boolean(cierre.clientes?.requiere_folio);
      if (requiere) {
        const parsed = registrarFolioSchema.safeParse({
          folio_cliente: folioInput,
          folio_fecha_recepcion: folioFecha,
          folio_vencimiento: folioVenc,
        });
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      } else {
        if (!folioFecha) throw new Error("La fecha de recepción es obligatoria");
        if (!folioVenc) throw new Error("La fecha de vencimiento es obligatoria");
      }
      await updateCierreWithAudit(
        {
          estado: "con_folio",
          folio_cliente: folioInput.trim() ? folioInput.trim() : null,
          folio_fecha_recepcion: folioFecha,
          folio_vencimiento: folioVenc,
        },
        "folio_registered",
      );
    },
    onSuccess: () => {
      toast.success("Folio registrado");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registrarFactura = useMutation({
    mutationFn: async () => {
      if (!cierre) throw new Error("Cierre no cargado");
      if ((cierre.estado ?? "") !== "con_folio")
        throw new Error("Solo puedes facturar desde estado con folio");
      if (cierre.clientes?.requiere_folio && !cierre.folio_cliente) {
        throw new Error("Este cliente requiere folio para facturar. Registra el folio primero.");
      }
      const parsed = registrarFacturaSchema.safeParse({
        factura_folio_sii: facturaFolio,
        factura_fecha: facturaFecha,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      await updateCierreWithAudit(
        {
          estado: "facturado",
          factura_folio_sii: parsed.data.factura_folio_sii.trim(),
          factura_fecha: parsed.data.factura_fecha,
        },
        "factura_registered",
      );

      const ordenIds = servicios
        .map((servicio) => servicio.ordenes_servicio?.id)
        .filter(Boolean) as string[];
      if (ordenIds.length > 0) {
        const { error: ordenesErr } = await supabase
          .from("ordenes_servicio")
          .update({ estado: "facturado" })
          .in("id", ordenIds)
          .neq("estado", "anulado");
        if (ordenesErr) throw ordenesErr;
      }
    },
    onSuccess: () => {
      toast.success("Factura registrada");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registrarPago = useMutation({
    mutationFn: async () => {
      if (!cierre) throw new Error("Cierre no cargado");
      if ((cierre.estado ?? "") !== "facturado")
        throw new Error("Solo puedes registrar pago desde facturado");
      const parsed = registrarPagoSchema.safeParse({
        pago_fecha: pagoFecha,
        pago_monto: pagoMonto,
        pago_medio: pagoMedio,
        pago_referencia: pagoRef || undefined,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      await updateCierreWithAudit(
        {
          estado: "pagado",
          pago_fecha: parsed.data.pago_fecha,
          pago_monto: Number(parsed.data.pago_monto),
          pago_medio: parsed.data.pago_medio,
          pago_referencia: parsed.data.pago_referencia ?? null,
        },
        "pago_registered",
      );
    },
    onSuccess: () => {
      toast.success("Pago registrado");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anular = useMutation({
    mutationFn: async () => {
      if (!cierre) throw new Error("Cierre no cargado");
      const e = cierre.estado ?? "abierto";
      if (!["abierto", "enviado", "con_folio"].includes(e)) {
        throw new Error("No se puede anular en este estado");
      }
      await updateCierreWithAudit({ estado: "anulado" }, "anulado");
    },
    onSuccess: () => {
      toast.success("Cierre anulado");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ordenIdsEnCierre = useMemo(() => {
    return new Set(
      servicios.map((s) => s.ordenes_servicio?.id).filter(Boolean) as string[],
    );
  }, [servicios]);

  const { data: disponibles = [], isFetching: fetchingDisponibles } = useQuery({
    queryKey: ["cierre", cierreId, "servicios-disponibles", openAdd],
    enabled: openAdd && !!cierre && (cierre.estado ?? "abierto") === "abierto",
    queryFn: async () => {
      const c = cierre as Cierre;
      const { data: usados, error: errU } = await supabase
        .from("cierre_servicios")
        .select("orden_id,cierre_id,cierres!inner(estado)")
        .neq("cierres.estado", "anulado")
        .neq("cierre_id", cierreId);
      if (errU) throw errU;
      const excluidos = new Set((usados ?? []).map((u: any) => u.orden_id));

      for (const id of ordenIdsEnCierre) excluidos.add(id);

      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select(
          "id,folio_interno,folio_cliente,tipo_servicio,monto,fecha_servicio,clientes_vehiculos(patente)",
        )
        .eq("cliente_id", c.cliente_id)
        .eq("estado", "completado")
        .gte("fecha_servicio", c.periodo_inicio ?? "")
        .lte("fecha_servicio", `${(c.periodo_fin ?? "").slice(0, 10)}T23:59:59`)
        .order("fecha_servicio", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ServicioDisponible[]).filter((s) => !excluidos.has(s.id));
    },
  });

  useEffect(() => {
    if (!openAdd) return;
    const map: Record<string, boolean> = {};
    for (const s of disponibles) map[s.id] = true;
    setAddSeleccionados(map);
  }, [openAdd, disponibles]);

  const disponiblesSeleccionados = useMemo(
    () => disponibles.filter((s) => addSeleccionados[s.id]),
    [disponibles, addSeleccionados],
  );

  const addServicios = useMutation({
    mutationFn: async () => {
      if (!cierre) throw new Error("Cierre no cargado");
      if ((cierre.estado ?? "abierto") !== "abierto") throw new Error("Solo puedes agregar en estado abierto");
      if (disponiblesSeleccionados.length === 0) throw new Error("Selecciona al menos un servicio");
      const filas = disponiblesSeleccionados.map((s) => ({
        cierre_id: cierreId,
        orden_id: s.id,
        monto_aplicado: Number(s.monto ?? 0),
      }));
      const { error } = await supabase.from("cierre_servicios").insert(filas);
      if (error) {
        if ((error as any).code === "23505") {
          throw new Error("Uno de los servicios ya está incluido en otro cierre activo");
        }
        throw error;
      }

      const nuevoMonto = montoServicios + disponiblesSeleccionados.reduce((acc, s) => acc + Number(s.monto ?? 0), 0);
      const nuevosTotales = calcTotales(nuevoMonto, ivaIncluido);
      await updateCierreWithAudit(
        { subtotal: nuevosTotales.subtotal, iva: nuevosTotales.iva, total: nuevosTotales.total },
        "servicios_added",
      );
    },
    onSuccess: () => {
      toast.success("Servicios agregados");
      setOpenAdd(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeServicio = useMutation({
    mutationFn: async (servicioId: string) => {
      if (!cierre) throw new Error("Cierre no cargado");
      if ((cierre.estado ?? "abierto") !== "abierto") throw new Error("Solo puedes quitar servicios en estado abierto");
      const servicio = servicios.find((s) => s.id === servicioId);
      if (!servicio) return;
      const monto = Number(servicio.monto_aplicado ?? servicio.ordenes_servicio?.monto ?? 0);
      const { error } = await supabase.from("cierre_servicios").delete().eq("id", servicioId);
      if (error) throw error;
      const nuevoMonto = Math.max(0, montoServicios - monto);
      const nuevosTotales = calcTotales(nuevoMonto, ivaIncluido);
      await updateCierreWithAudit(
        { subtotal: nuevosTotales.subtotal, iva: nuevosTotales.iva, total: nuevosTotales.total },
        "servicio_removed",
      );
    },
    onSuccess: () => {
      toast.success("Servicio quitado");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !cierre) {
    return <div className="text-muted-foreground">Cargando…</div>;
  }

  const estadoActual = cierre.estado ?? "abierto";
  const steps = ["abierto", "enviado", "con_folio", "facturado", "pagado"] as const;
  const stepIndex = steps.indexOf(estadoActual as any);
  const progressPct = stepIndex >= 0 ? (stepIndex / (steps.length - 1)) * 100 : 0;
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const enviadoAtrasado = estadoActual === "enviado" && !!cierre.updated_at && cierre.updated_at < seteDiasAtras;

  const exportarPDF = async () => {
    const { data: empresa } = await supabase.from("config_empresa").select("*").limit(1).maybeSingle();

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${(empresa as any)?.nombre ?? "Empresa"}`, 14, 16);
    doc.setFontSize(12);
    doc.text(`Cierre ${cierre.numero ?? cierre.id.slice(0, 8)}`, 14, 26);
    doc.setFontSize(10);

    const cliente = cierre.clientes;
    doc.text(`Cliente: ${cliente?.nombre ?? ""}`, 14, 36);
    if (cliente?.rut) doc.text(`RUT: ${cliente.rut}`, 14, 42);
    doc.text(`Período: ${formatDate(cierre.periodo_inicio)} - ${formatDate(cierre.periodo_fin)}`, 14, 48);
    if (cierre.folio_cliente) doc.text(`Folio cliente: ${cierre.folio_cliente}`, 14, 54);
    if (cierre.folio_vencimiento) doc.text(`Vencimiento: ${formatDate(cierre.folio_vencimiento)}`, 14, 60);

    autoTable(doc, {
      startY: 68,
      head: [["N°", "Folio int.", "Folio cli.", "Fecha", "Tipo", "Vehículo", "Monto"]],
      body: servicios.map((s, i) => [
        String(i + 1),
        s.ordenes_servicio?.folio_interno ?? "—",
        s.ordenes_servicio?.folio_cliente ?? "—",
        formatDate(s.ordenes_servicio?.fecha_servicio),
        s.ordenes_servicio?.tipo_servicio ?? "—",
        s.ordenes_servicio?.clientes_vehiculos?.patente ?? "—",
        formatCLP(s.monto_aplicado ?? s.ordenes_servicio?.monto),
      ]),
      styles: { fontSize: 9 },
    });

    const endY = (doc as any).lastAutoTable.finalY + 8;
    doc.text(`Subtotal: ${formatCLP(cierre.subtotal ?? totalesCalc.subtotal)}`, 140, endY);
    doc.text(`IVA: ${formatCLP(cierre.iva ?? totalesCalc.iva)}`, 140, endY + 6);
    doc.setFontSize(12);
    doc.text(`Total: ${formatCLP(cierre.total ?? totalesCalc.total)}`, 140, endY + 14);

    if (cierre.clientes?.condicion_pago != null) {
      doc.setFontSize(10);
      doc.text(`Condición de pago: ${Number(cierre.clientes.condicion_pago)} días`, 14, endY + 10);
    }
    doc.text("Firma cliente: ________________________________", 14, endY + 26);

    doc.save(`cierre-${cierre.numero ?? cierre.id.slice(0, 8)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/cierres">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              Cierre {cierre.numero ?? cierre.id.slice(0, 8)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {cierre.clientes?.nombre} · {formatDate(cierre.periodo_inicio)} →{" "}
              {formatDate(cierre.periodo_fin)}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={exportarPDF}>
          <Download className="h-4 w-4 mr-2" /> Exportar PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Servicios incluidos ({servicios.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio interno</TableHead>
                    <TableHead>Folio cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Vehículo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    {estadoActual === "abierto" && <TableHead className="w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servicios.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        {s.ordenes_servicio?.id ? (
                          <Link
                            to="/ordenes/$ordenId"
                            params={{ ordenId: s.ordenes_servicio.id }}
                            className="hover:underline"
                          >
                            {s.ordenes_servicio.folio_interno ?? s.ordenes_servicio.id.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{s.ordenes_servicio?.folio_cliente ?? "—"}</TableCell>
                      <TableCell>{formatDate(s.ordenes_servicio?.fecha_servicio)}</TableCell>
                      <TableCell className="capitalize">
                        {s.ordenes_servicio?.tipo_servicio ?? "—"}
                      </TableCell>
                      <TableCell>
                        {s.ordenes_servicio?.clientes_vehiculos?.patente ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCLP(s.monto_aplicado ?? s.ordenes_servicio?.monto)}
                      </TableCell>
                      {estadoActual === "abierto" && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("¿Quitar este servicio del cierre?")) {
                                removeServicio.mutate(s.id);
                              }
                            }}
                            disabled={removeServicio.isPending}
                            title="Quitar"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>{formatCLP(cierre.subtotal ?? totalesCalc.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA 19%:</span>
                <span>{formatCLP(cierre.iva ?? totalesCalc.iva)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1 text-base">
                <span>Total:</span>
                <span>{formatCLP(cierre.total ?? totalesCalc.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="w-full">
              <TabsTrigger value="detalle" className="flex-1">
                Flujo
              </TabsTrigger>
              <TabsTrigger value="historial" className="flex-1">
                Historial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="detalle" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    Estado
                    <Badge variant={estadoCierreVariant(cierre.estado)}>
                      {estadoCierreLabel(cierre.estado)}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Abierto</span>
                      <span>Pagado</span>
                    </div>
                    <Progress value={progressPct} />
                    <div className="flex flex-wrap gap-2">
                      {steps.map((s, i) => (
                        <Badge
                          key={s}
                          variant={i <= stepIndex ? "default" : "outline"}
                          className="capitalize"
                        >
                          {s.replace("_", " ")}
                        </Badge>
                      ))}
                      {estadoActual === "anulado" && (
                        <Badge variant="destructive">anulado</Badge>
                      )}
                    </div>
                  </div>

                  {enviadoAtrasado && (
                    <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                      Este cierre lleva más de 7 días en estado enviado.
                    </div>
                  )}

                  {cierre.estado === "abierto" && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setOpenAdd(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" /> Agregar servicios
                      </Button>
                      <Button
                        className="w-full"
                        onClick={() => enviar.mutate()}
                        disabled={enviar.isPending || servicios.length === 0}
                      >
                        {enviar.isPending ? "Enviando..." : "Enviar al cliente"}
                      </Button>
                    </div>
                  )}

                  {cierre.estado === "enviado" && (
                    <div className="space-y-2">
                      <Label>
                        Folio del cliente{cierre.clientes?.requiere_folio ? " *" : ""}
                      </Label>
                      <Input
                        value={folioInput}
                        onChange={(e) => setFolioInput(e.target.value)}
                        placeholder="Ej: HES-12345"
                      />
                      <Label>Fecha recepción *</Label>
                      <Input
                        type="date"
                        value={folioFecha}
                        onChange={(e) => setFolioFecha(e.target.value)}
                      />
                      <Label>Vencimiento *</Label>
                      <Input
                        type="date"
                        value={folioVenc}
                        onChange={(e) => setFolioVenc(e.target.value)}
                      />
                      <Button
                        className="w-full"
                        onClick={() => registrarFolio.mutate()}
                        disabled={registrarFolio.isPending}
                      >
                        {registrarFolio.isPending ? "Guardando..." : "Registrar folio"}
                      </Button>
                    </div>
                  )}

                  {cierre.estado === "con_folio" && (
                    <div className="space-y-2">
                      {cierre.folio_cliente && (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Folio cliente:</span>{" "}
                          <span className="font-medium">{cierre.folio_cliente}</span>
                        </div>
                      )}
                      <Label>Folio SII *</Label>
                      <Input
                        value={facturaFolio}
                        onChange={(e) => setFacturaFolio(e.target.value)}
                        placeholder="N° factura SII"
                      />
                      <Label>Fecha factura *</Label>
                      <Input
                        type="date"
                        value={facturaFecha}
                        onChange={(e) => setFacturaFecha(e.target.value)}
                      />
                      <Button
                        className="w-full"
                        onClick={() => registrarFactura.mutate()}
                        disabled={registrarFactura.isPending}
                      >
                        {registrarFactura.isPending ? "Guardando..." : "Registrar factura"}
                      </Button>
                    </div>
                  )}

                  {cierre.estado === "facturado" && (
                    <div className="space-y-2">
                      <div className="text-sm">
                        <span className="text-muted-foreground">Factura:</span>{" "}
                        <span className="font-medium">
                          {cierre.factura_folio_sii ?? "—"}
                        </span>
                      </div>
                      <Label>Fecha de pago *</Label>
                      <Input
                        type="date"
                        value={pagoFecha}
                        onChange={(e) => setPagoFecha(e.target.value)}
                      />
                      <Label>Monto *</Label>
                      <Input
                        type="number"
                        value={pagoMonto}
                        onChange={(e) => setPagoMonto(e.target.value)}
                        placeholder={String(cierre.total ?? "")}
                      />
                      <Label>Medio *</Label>
                      <Select value={pagoMedio} onValueChange={setPagoMedio}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="transferencia">transferencia</SelectItem>
                          <SelectItem value="cheque">cheque</SelectItem>
                          <SelectItem value="efectivo">efectivo</SelectItem>
                        </SelectContent>
                      </Select>
                      <Label>Referencia</Label>
                      <Input
                        value={pagoRef}
                        onChange={(e) => setPagoRef(e.target.value)}
                        placeholder="N° transferencia / cheque"
                      />
                      <Button
                        className="w-full"
                        onClick={() => registrarPago.mutate()}
                        disabled={registrarPago.isPending}
                      >
                        {registrarPago.isPending ? "Guardando..." : "Registrar pago"}
                      </Button>
                    </div>
                  )}

                  {cierre.estado === "pagado" && (
                    <div className="text-sm text-muted-foreground">
                      Pagado el {formatDate(cierre.pago_fecha)} · {formatCLP(cierre.pago_monto)}
                    </div>
                  )}

                  {["abierto", "enviado", "con_folio"].includes(estadoActual) && (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        if (confirm("¿Anular este cierre? Esto liberará los servicios.")) {
                          anular.mutate();
                        }
                      }}
                      disabled={anular.isPending}
                    >
                      {anular.isPending ? "Anulando..." : "Anular cierre"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historial">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Historial</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChangeHistoryPanel entityType="cierre" entityId={cierreId} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar servicios</DialogTitle>
            <DialogDescription>
              Solo muestra servicios completados del período que no estén en otros cierres activos.
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Folio interno</TableHead>
                  <TableHead>Folio cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fetchingDisponibles ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : disponibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                      No hay servicios disponibles.
                    </TableCell>
                  </TableRow>
                ) : (
                  disponibles.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Checkbox
                          checked={!!addSeleccionados[s.id]}
                          onCheckedChange={(v) =>
                            setAddSeleccionados((prev) => ({ ...prev, [s.id]: !!v }))
                          }
                        />
                      </TableCell>
                      <TableCell className="font-medium">{s.folio_interno ?? s.id.slice(0, 8)}</TableCell>
                      <TableCell>{s.folio_cliente ?? "—"}</TableCell>
                      <TableCell>{formatDate(s.fecha_servicio)}</TableCell>
                      <TableCell className="capitalize">{s.tipo_servicio ?? "—"}</TableCell>
                      <TableCell>{s.clientes_vehiculos?.patente ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatCLP(s.monto ?? 0)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {disponibles.length > 0 && (
            <div className="ml-auto w-full max-w-sm space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Seleccionados</span>
                <span>{disponiblesSeleccionados.length}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1">
                <span>Total</span>
                <span>
                  {formatCLP(
                    disponiblesSeleccionados.reduce((acc, s) => acc + Number(s.monto ?? 0), 0),
                  )}
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAdd(false)}>
              Cancelar
            </Button>
            <Button onClick={() => addServicios.mutate()} disabled={addServicios.isPending}>
              {addServicios.isPending ? "Agregando..." : "Agregar seleccionados"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
