import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, Download, Pencil, Send, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChangeHistoryPanel } from "@/components/shared/change-history-panel";
import { formatCLP, formatDate } from "@/lib/format";
import { createCotizacionSchema } from "@/lib/validations/cotizaciones";
import { createOCSchema } from "@/lib/validations/ordenes-compra";

type CotizacionDetalle = {
  id: string;
  numero: string | null;
  cliente_id: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  condicion_pago: number | null;
  iva_incluido: boolean | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  estado: string | null;
  observaciones: string | null;
  clientes: { nombre: string; rut: string | null; direccion: string | null; email: string | null; telefono: string | null } | null;
  cotizacion_lineas: Array<{
    id: string;
    orden_id: string | null;
    descripcion: string;
    cantidad: number | null;
    precio_unitario: number | null;
    descuento: number | null;
    total_linea: number | null;
    ordenes_servicio: { id: string; folio_interno: string | null } | null;
  }>;
};

function estadoVariant(estado: string | null) {
  if (estado === "aprobada" || estado === "facturada") return "default" as const;
  if (estado === "enviada") return "secondary" as const;
  if (estado === "rechazada") return "destructive" as const;
  if (estado === "vencida") return "outline" as const;
  return "outline" as const;
}

function calcTotales(lineas: Array<any>, ivaIncluido: boolean) {
  const lineasConTotal = lineas.map((l) => {
    const cantidad = Number(l.cantidad ?? 0);
    const precio = Number(l.precio_unitario ?? 0);
    const desc = Number(l.descuento ?? 0);
    const total_linea = cantidad * precio * (1 - desc / 100);
    return { ...l, total_linea };
  });
  const subtotal = lineasConTotal.reduce((s, l) => s + Number(l.total_linea ?? 0), 0);
  const iva = ivaIncluido ? subtotal * 0.19 : 0;
  const total = subtotal + iva;
  return { lineasConTotal, subtotal, iva, total };
}

async function generarNumeroCotizacion(): Promise<string> {
  const { data: last, error } = await supabase
    .from("cotizaciones")
    .select("numero")
    .ilike("numero", "COT-%")
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const lastNum = (last as any)?.numero as string | null | undefined;
  const m = lastNum?.match(/(\d+)\s*$/);
  const next = (m ? Number(m[1]) : 0) + 1;
  return `COT-${String(next).padStart(4, "0")}`;
}

async function generarNumeroOC(): Promise<string> {
  const { data: last, error } = await supabase
    .from("ordenes_compra")
    .select("numero_interno")
    .ilike("numero_interno", "OC-%")
    .order("numero_interno", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const lastNum = (last as any)?.numero_interno as string | null | undefined;
  const m = lastNum?.match(/(\d+)\s*$/);
  const next = (m ? Number(m[1]) : 0) + 1;
  return `OC-${String(next).padStart(4, "0")}`;
}

export const Route = createFileRoute("/_app/cotizaciones/$cotizacionId")({
  component: CotizacionDetailPage,
});

function CotizacionDetailPage() {
  const { cotizacionId } = (Route as any).useParams() as { cotizacionId: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const autoExpireRef = useRef(false);

  const { data: cotizacion, isLoading } = useQuery({
    queryKey: ["cotizaciones", cotizacionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cotizaciones")
        .select(
          "*, clientes(nombre,rut,direccion,email,telefono), cotizacion_lineas(*, ordenes_servicio(id,folio_interno))",
        )
        .eq("id", cotizacionId)
        .single();
      if (error) throw error;
      return data as unknown as CotizacionDetalle;
    },
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", "selector-cotizaciones"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nombre,rut")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ordenCompra } = useQuery({
    queryKey: ["cotizaciones", cotizacionId, "oc"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_compra")
        .select("id,numero_interno,numero_cliente,estado")
        .eq("cotizacion_id", cotizacionId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [editing, setEditing] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [fechaVenc, setFechaVenc] = useState("");
  const [condPago, setCondPago] = useState("0");
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [obs, setObs] = useState("");
  const [lineas, setLineas] = useState<Array<any>>([]);

  const [openCrearOC, setOpenCrearOC] = useState(false);
  const ocFileRef = useRef<HTMLInputElement>(null);
  const [ocNumeroCliente, setOcNumeroCliente] = useState("");
  const [ocFechaRecepcion, setOcFechaRecepcion] = useState(() => new Date().toISOString().slice(0, 10));
  const [ocMontoTotal, setOcMontoTotal] = useState("");
  const [ocFile, setOcFile] = useState<File | null>(null);

  useEffect(() => {
    if (!cotizacion) return;
    setClienteId(cotizacion.cliente_id);
    setFechaVenc((cotizacion.fecha_vencimiento ?? "").slice(0, 10));
    setCondPago(String(Number(cotizacion.condicion_pago ?? 0)));
    setIvaIncluido(Boolean(cotizacion.iva_incluido ?? true));
    setObs(cotizacion.observaciones ?? "");
    setLineas(
      (cotizacion.cotizacion_lineas ?? []).map((l) => ({
        id: l.id,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad ?? 1),
        precio_unitario: Number(l.precio_unitario ?? 0),
        descuento: Number(l.descuento ?? 0),
        orden_id: l.orden_id ?? undefined,
      })),
    );

    setOcMontoTotal(String(Number(cotizacion.total ?? 0)));
  }, [cotizacion]);

  const { lineasConTotal, subtotal, iva, total } = useMemo(
    () => calcTotales(lineas, ivaIncluido),
    [lineas, ivaIncluido],
  );

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!cotizacion) return;
      if (cotizacion.estado !== "borrador") throw new Error("Solo se puede editar en borrador");

      const parsed = createCotizacionSchema.safeParse({
        cliente_id: clienteId,
        fecha_vencimiento: fechaVenc,
        condicion_pago: condPago,
        iva_incluido: ivaIncluido,
        observaciones: obs || undefined,
        lineas: lineasConTotal.map((l) => ({
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
          descuento: l.descuento,
          orden_id: l.orden_id,
        })),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      }

      const { data: before, error: beforeErr } = await supabase
        .from("cotizaciones")
        .select("*")
        .eq("id", cotizacionId)
        .single();
      if (beforeErr) throw beforeErr;

      const { error } = await supabase
        .from("cotizaciones")
        .update({
          cliente_id: parsed.data.cliente_id,
          fecha_vencimiento: parsed.data.fecha_vencimiento,
          condicion_pago: Number(parsed.data.condicion_pago ?? 0),
          iva_incluido: parsed.data.iva_incluido,
          observaciones: parsed.data.observaciones ?? null,
          subtotal,
          iva,
          total,
        })
        .eq("id", cotizacionId);
      if (error) throw error;

      const { error: delErr } = await supabase
        .from("cotizacion_lineas")
        .delete()
        .eq("cotizacion_id", cotizacionId);
      if (delErr) throw delErr;

      const payload = lineasConTotal.map((l) => ({
        cotizacion_id: cotizacionId,
        orden_id: l.orden_id ?? null,
        descripcion: l.descripcion,
        cantidad: Math.round(Number(l.cantidad ?? 0)),
        precio_unitario: Number(l.precio_unitario ?? 0),
        descuento: Number(l.descuento ?? 0),
        total_linea: Number(l.total_linea ?? 0),
      }));
      const { error: insErr } = await supabase.from("cotizacion_lineas").insert(payload);
      if (insErr) throw insErr;

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "cotizacion",
        entity_id: cotizacionId,
        action: "updated",
        old_value: before,
        new_value: { ...parsed.data, subtotal, iva, total, lineas: payload },
      });
      if (histErr) throw new Error(histErr.message);

      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      queryClient.invalidateQueries({ queryKey: ["cotizaciones", cotizacionId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onSuccess: () => {
      toast.success("Cotización actualizada");
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateEstado = useMutation({
    mutationFn: async (estado: string) => {
      if (!cotizacion) return;
      const actual = cotizacion.estado ?? "borrador";
      const valid =
        (actual === "borrador" && estado === "enviada") ||
        (actual === "enviada" && (estado === "aprobada" || estado === "rechazada" || estado === "vencida")) ||
        (actual === "aprobada" && estado === "facturada") ||
        (estado === "vencida");
      if (!valid) throw new Error("Transición de estado no permitida");

      const { data: before, error: beforeErr } = await supabase
        .from("cotizaciones")
        .select("*")
        .eq("id", cotizacionId)
        .single();
      if (beforeErr) throw beforeErr;

      const { error } = await supabase
        .from("cotizaciones")
        .update({ estado })
        .eq("id", cotizacionId);
      if (error) throw error;

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "cotizacion",
        entity_id: cotizacionId,
        action: "estado_changed",
        old_value: { estado: (before as any).estado },
        new_value: { estado },
      });
      if (histErr) throw new Error(histErr.message);

      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      queryClient.invalidateQueries({ queryKey: ["cotizaciones", cotizacionId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onSuccess: () => toast.success("Estado actualizado"),
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicar = useMutation({
    mutationFn: async () => {
      if (!cotizacion) return "";
      const baseLineas = (cotizacion.cotizacion_lineas ?? []).map((l) => ({
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad ?? 1),
        precio_unitario: Number(l.precio_unitario ?? 0),
        descuento: Number(l.descuento ?? 0),
        orden_id: l.orden_id ?? undefined,
      }));
      const { lineasConTotal: calcLineas, subtotal, iva, total } = calcTotales(
        baseLineas,
        Boolean(cotizacion.iva_incluido ?? true),
      );

      let numero = "";
      let createdId = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        numero = await generarNumeroCotizacion();
        const { data, error: insErr } = await supabase
          .from("cotizaciones")
          .insert({
            numero,
            cliente_id: cotizacion.cliente_id,
            fecha_emision: new Date().toISOString().slice(0, 10),
            fecha_vencimiento: cotizacion.fecha_vencimiento,
            condicion_pago: cotizacion.condicion_pago ?? 0,
            iva_incluido: cotizacion.iva_incluido ?? true,
            observaciones: cotizacion.observaciones ?? null,
            subtotal,
            iva,
            total,
            estado: "borrador",
          })
          .select("id")
          .single();
        if (insErr) {
          if ((insErr as any).code === "23505") continue;
          throw insErr;
        }
        createdId = (data as any).id as string;
        break;
      }
      if (!createdId) throw new Error("No se pudo duplicar (número)");

      const payload = calcLineas.map((l) => ({
        cotizacion_id: createdId,
        orden_id: l.orden_id ?? null,
        descripcion: l.descripcion,
        cantidad: Math.round(Number(l.cantidad ?? 0)),
        precio_unitario: Number(l.precio_unitario ?? 0),
        descuento: Number(l.descuento ?? 0),
        total_linea: Number(l.total_linea ?? 0),
      }));
      const { error: lineasErr } = await supabase.from("cotizacion_lineas").insert(payload);
      if (lineasErr) throw lineasErr;

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "cotizacion",
        entity_id: createdId,
        action: "duplicated",
        new_value: { from: cotizacionId, numero, subtotal, iva, total },
      });
      if (histErr) throw new Error(histErr.message);

      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      return createdId;
    },
    onSuccess: (id) => {
      if (!id) return;
      toast.success("Cotización duplicada");
      navigate({ to: (`/cotizaciones/${id}` as any) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: async () => {
      if (!cotizacion) return;
      if (cotizacion.estado !== "borrador") throw new Error("Solo se puede eliminar en borrador");
      const { data: before, error: beforeErr } = await supabase
        .from("cotizaciones")
        .select("*")
        .eq("id", cotizacionId)
        .single();
      if (beforeErr) throw beforeErr;

      const { error } = await supabase.from("cotizaciones").delete().eq("id", cotizacionId);
      if (error) throw error;

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "cotizacion",
        entity_id: cotizacionId,
        action: "deleted",
        old_value: before,
      });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Cotización eliminada");
      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      navigate({ to: "/cotizaciones" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const crearOC = useMutation({
    mutationFn: async () => {
      if (!cotizacion) return;
      if (cotizacion.estado !== "aprobada") throw new Error("Solo se puede crear OC desde una cotización aprobada");
      if (ordenCompra) throw new Error("Ya existe una OC vinculada");

      const parsed = createOCSchema.safeParse({
        cliente_id: cotizacion.cliente_id,
        numero_cliente: ocNumeroCliente || undefined,
        cotizacion_id: cotizacionId,
        fecha_recepcion: ocFechaRecepcion,
        monto_total: ocMontoTotal,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      }

      let archivoUrl: string | null = null;
      if (ocFile) {
        const ext = ocFile.name.split(".").pop() ?? "pdf";
        const path = `oc/${cotizacionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("oc-clientes")
          .upload(path, ocFile, { upsert: false, contentType: ocFile.type });
        if (upErr) throw upErr;
        archivoUrl = supabase.storage.from("oc-clientes").getPublicUrl(path).data.publicUrl;
      }

      let numeroInterno = "";
      let ocId = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        numeroInterno = await generarNumeroOC();
        const { data, error } = await supabase
          .from("ordenes_compra")
          .insert({
            numero_interno: numeroInterno,
            numero_cliente: parsed.data.numero_cliente ?? null,
            cliente_id: parsed.data.cliente_id,
            cotizacion_id: cotizacionId,
            fecha_recepcion: parsed.data.fecha_recepcion,
            monto_total: Number(parsed.data.monto_total ?? 0),
            monto_ejecutado: 0,
            estado: "recibida",
            archivo_pdf_url: archivoUrl,
          })
          .select("id")
          .single();
        if (error) {
          if ((error as any).code === "23505") continue;
          throw error;
        }
        ocId = (data as any).id as string;
        break;
      }
      if (!ocId) throw new Error("No se pudo generar número interno");

      const { error: cotErr } = await supabase
        .from("cotizaciones")
        .update({ estado: "facturada" })
        .eq("id", cotizacionId);
      if (cotErr) throw cotErr;

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "orden_compra",
        entity_id: ocId,
        action: "created_from_cotizacion",
        new_value: { numero_interno: numeroInterno, ...parsed.data, archivo_pdf_url: archivoUrl },
      });
      if (histErr) throw new Error(histErr.message);

      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      queryClient.invalidateQueries({ queryKey: ["cotizaciones", cotizacionId] });
      queryClient.invalidateQueries({ queryKey: ["cotizaciones", cotizacionId, "oc"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onSuccess: () => {
      toast.success("OC creada");
      setOpenCrearOC(false);
      setOcFile(null);
      if (ocFileRef.current) ocFileRef.current.value = "";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportarPDF = async () => {
    if (!cotizacion) return;
    const { data: empresa, error } = await supabase.from("config_empresa").select("*").limit(1).maybeSingle();
    if (error) {
      toast.error(error.message);
      return;
    }

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${(empresa as any)?.nombre ?? "Empresa"}`, 14, 16);
    doc.setFontSize(12);
    doc.text(`Cotización ${cotizacion.numero ?? cotizacion.id.slice(0, 8)}`, 14, 26);
    doc.setFontSize(10);
    doc.text(`Fecha emisión: ${formatDate(cotizacion.fecha_emision)}`, 14, 34);
    doc.text(`Vence: ${formatDate(cotizacion.fecha_vencimiento)}`, 14, 40);
    doc.text(`Estado: ${(cotizacion.estado ?? "—").toString()}`, 14, 46);

    const cliente = cotizacion.clientes;
    const rightX = 120;
    doc.text(`Cliente: ${cliente?.nombre ?? ""}`, rightX, 34);
    if (cliente?.rut) doc.text(`RUT: ${cliente.rut}`, rightX, 40);
    if (cliente?.direccion) doc.text(`Dirección: ${cliente.direccion}`, rightX, 46);

    const rows = (cotizacion.cotizacion_lineas ?? []).map((l) => [
      l.descripcion,
      String(Number(l.cantidad ?? 0)),
      formatCLP(Number(l.precio_unitario ?? 0)),
      `${Number(l.descuento ?? 0)}%`,
      formatCLP(Number(l.total_linea ?? 0)),
    ]);

    autoTable(doc, {
      startY: 54,
      head: [["Descripción", "Cant.", "Precio", "Desc.", "Total"]],
      body: rows,
      styles: { fontSize: 9 },
      columnStyles: { 4: { halign: "right" } },
    });

    const endY = (doc as any).lastAutoTable.finalY + 8;
    doc.text(`Subtotal: ${formatCLP(Number(cotizacion.subtotal ?? subtotal))}`, 140, endY);
    doc.text(`IVA: ${formatCLP(Number(cotizacion.iva ?? iva))}`, 140, endY + 6);
    doc.setFontSize(12);
    doc.text(`Total: ${formatCLP(Number(cotizacion.total ?? total))}`, 140, endY + 14);

    if (cotizacion.condicion_pago != null) {
      doc.setFontSize(10);
      doc.text(`Condición de pago: ${Number(cotizacion.condicion_pago)} días`, 14, endY + 12);
    }
    if (cotizacion.observaciones) {
      doc.text(`Observaciones: ${cotizacion.observaciones}`, 14, endY + 18);
    }

    doc.save(`cotizacion-${cotizacion.numero ?? cotizacion.id.slice(0, 8)}.pdf`);
  };

  useEffect(() => {
    if (!cotizacion) return;
    if (autoExpireRef.current) return;
    if (cotizacion.estado !== "enviada") return;
    const venc = (cotizacion.fecha_vencimiento ?? "").slice(0, 10);
    if (!venc) return;
    const hoy = new Date().toISOString().slice(0, 10);
    if (venc < hoy) {
      autoExpireRef.current = true;
      updateEstado.mutate("vencida");
    }
  }, [cotizacion]);

  if (isLoading) return <div className="text-muted-foreground">Cargando cotización...</div>;
  if (!cotizacion) return <div className="text-muted-foreground">Cotización no encontrada.</div>;

  const numero = cotizacion.numero ?? cotizacion.id.slice(0, 8);
  const canEdit = cotizacion.estado === "borrador";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/cotizaciones">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Cotización {numero}</h1>
            <p className="text-sm text-muted-foreground">
              {cotizacion.clientes?.nombre ?? "Cliente"} · Emisión {formatDate(cotizacion.fecha_emision)} · Vence{" "}
              {formatDate(cotizacion.fecha_vencimiento)}
            </p>
          </div>
          <Badge variant={estadoVariant(cotizacion.estado)} className="capitalize">
            {cotizacion.estado ?? "—"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarPDF}>
            <Download className="h-4 w-4 mr-2" /> Exportar PDF
          </Button>
          {canEdit && !editing && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </Button>
          )}
          <Button variant="outline" onClick={() => duplicar.mutate()} disabled={duplicar.isPending}>
            <Copy className="h-4 w-4 mr-2" /> Duplicar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Líneas</CardTitle>
              <div className="flex flex-wrap gap-2">
                {cotizacion.estado === "borrador" && (
                  <Button onClick={() => updateEstado.mutate("enviada")} disabled={updateEstado.isPending}>
                    <Send className="h-4 w-4 mr-2" /> Enviar
                  </Button>
                )}
                {cotizacion.estado === "enviada" && (
                  <>
                    <Button onClick={() => updateEstado.mutate("aprobada")} disabled={updateEstado.isPending}>
                      Marcar aprobada
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => updateEstado.mutate("rechazada")}
                      disabled={updateEstado.isPending}
                    >
                      Marcar rechazada
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Orden</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Desc.</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(cotizacion.cotizacion_lineas ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Sin líneas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    cotizacion.cotizacion_lineas.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">{l.descripcion}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {l.ordenes_servicio?.folio_interno ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">{Number(l.cantidad ?? 0)}</TableCell>
                        <TableCell className="text-right">{formatCLP(Number(l.precio_unitario ?? 0))}</TableCell>
                        <TableCell className="text-right">{Number(l.descuento ?? 0)}%</TableCell>
                        <TableCell className="text-right">{formatCLP(Number(l.total_linea ?? 0))}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Tabs defaultValue="historial">
            <TabsList>
              <TabsTrigger value="historial">Historial</TabsTrigger>
            </TabsList>
            <TabsContent value="historial">
              <ChangeHistoryPanel entityType="cotizacion" entityId={cotizacionId} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Totales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatCLP(Number(cotizacion.subtotal ?? 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA</span>
                <span className="font-medium">{formatCLP(Number(cotizacion.iva ?? 0))}</span>
              </div>
              <div className="flex justify-between text-base">
                <span className="font-semibold">Total</span>
                <span className="font-semibold">{formatCLP(Number(cotizacion.total ?? 0))}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">OC vinculada</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {ordenCompra ? (
                <div className="space-y-1">
                  <div>
                    <span className="text-muted-foreground">Número:</span>{" "}
                    <span className="font-medium">
                      {ordenCompra.numero_interno ?? ordenCompra.numero_cliente ?? ordenCompra.id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="capitalize">
                    <span className="text-muted-foreground">Estado:</span> {ordenCompra.estado ?? "—"}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-muted-foreground">Sin OC vinculada.</div>
                  {cotizacion.estado === "aprobada" && (
                    <Dialog open={openCrearOC} onOpenChange={setOpenCrearOC}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          Crear OC
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Crear OC desde cotización</DialogTitle>
                          <DialogDescription>
                            Al crearla, la cotización quedará en estado facturada.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="md:col-span-2">
                            <Label>Cliente</Label>
                            <Input value={cotizacion.clientes?.nombre ?? ""} disabled />
                          </div>
                          <div>
                            <Label>N° OC cliente</Label>
                            <Input
                              value={ocNumeroCliente}
                              onChange={(e) => setOcNumeroCliente(e.target.value)}
                              placeholder="Opcional"
                            />
                          </div>
                          <div>
                            <Label>Fecha recepción *</Label>
                            <Input
                              type="date"
                              value={ocFechaRecepcion}
                              onChange={(e) => setOcFechaRecepcion(e.target.value)}
                            />
                          </div>
                          <div>
                            <Label>Monto total *</Label>
                            <Input
                              type="number"
                              value={ocMontoTotal}
                              onChange={(e) => setOcMontoTotal(e.target.value)}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label>PDF OC (opcional)</Label>
                            <Input
                              ref={ocFileRef}
                              type="file"
                              accept="application/pdf"
                              onChange={(e) => setOcFile(e.target.files?.[0] ?? null)}
                            />
                          </div>
                          <div className="md:col-span-2 flex justify-end">
                            <Button onClick={() => crearOC.mutate()} disabled={crearOC.isPending}>
                              {crearOC.isPending ? "Creando..." : "Crear OC"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {editing && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Editar (borrador)</CardTitle>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cerrar
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Cliente *</Label>
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nombre} {c.rut ? `· ${c.rut}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vence *</Label>
                  <Input type="date" value={fechaVenc} onChange={(e) => setFechaVenc(e.target.value)} />
                </div>
                <div>
                  <Label>Condición de pago (días)</Label>
                  <Input type="number" value={condPago} onChange={(e) => setCondPago(e.target.value)} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div>
                    <div className="text-sm font-medium">IVA incluido</div>
                    <div className="text-xs text-muted-foreground">Calcula IVA (19%) sobre subtotal.</div>
                  </div>
                  <Select value={ivaIncluido ? "si" : "no"} onValueChange={(v) => setIvaIncluido(v === "si")}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="si">Sí</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Observaciones</Label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
                </div>
                <div className="rounded-md border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Líneas</div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setLineas((prev) => [
                          ...prev,
                          { descripcion: "", cantidad: 1, precio_unitario: 0, descuento: 0, orden_id: undefined },
                        ])
                      }
                    >
                      + Agregar
                    </Button>
                  </div>
                  {lineasConTotal.map((l, idx) => (
                    <div key={idx} className="border rounded-md p-3 space-y-3">
                      <div>
                        <Label className="text-xs">Descripción *</Label>
                        <Input
                          value={l.descripcion}
                          onChange={(e) =>
                            setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, descripcion: e.target.value } : x)))
                          }
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <Label className="text-xs">Cantidad *</Label>
                          <Input
                            type="number"
                            value={String(l.cantidad ?? 1)}
                            onChange={(e) =>
                              setLineas((prev) => prev.map((x, i) => (i === idx ? { ...x, cantidad: e.target.value } : x)))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Precio *</Label>
                          <Input
                            type="number"
                            value={String(l.precio_unitario ?? 0)}
                            onChange={(e) =>
                              setLineas((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, precio_unitario: e.target.value } : x)),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Descuento %</Label>
                          <Input
                            type="number"
                            value={String(l.descuento ?? 0)}
                            onChange={(e) =>
                              setLineas((prev) =>
                                prev.map((x, i) => (i === idx ? { ...x, descuento: e.target.value } : x)),
                              )
                            }
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-muted-foreground">
                          Total: <span className="font-medium text-foreground">{formatCLP(l.total_linea ?? 0)}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={lineasConTotal.length === 1}
                        >
                          Quitar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium">{formatCLP(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA</span>
                    <span className="font-medium">{formatCLP(iva)}</span>
                  </div>
                  <div className="flex justify-between text-base">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold">{formatCLP(total)}</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Acciones</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    if (confirm("¿Eliminar esta cotización? (solo borrador)")) eliminar.mutate();
                  }}
                  disabled={eliminar.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
