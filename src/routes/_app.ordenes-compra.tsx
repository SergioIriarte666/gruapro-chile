import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, FileText, Download } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PDFImporter } from "@/components/pdf-importer";
import { formatCLP, formatDate } from "@/lib/format";
import { createOCSchema } from "@/lib/validations/ordenes-compra";

type ClienteMin = { id: string; nombre: string };
type CotizacionMin = { id: string; numero: string | null; total: number | null; estado: string | null };

type OCRow = {
  id: string;
  numero_interno: string | null;
  numero_cliente: string | null;
  cliente_id: string;
  cotizacion_id: string | null;
  fecha_recepcion: string | null;
  monto_total: number | null;
  monto_ejecutado: number | null;
  estado: string | null;
  archivo_pdf_url: string | null;
  clientes: { nombre: string } | null;
  cotizaciones: { numero: string | null } | null;
};

type ServicioRow = {
  id: string;
  folio_interno: string | null;
  folio_cliente: string | null;
  tipo_servicio: string | null;
  monto: number | null;
  estado: string | null;
  fecha_servicio: string | null;
};

const ESTADOS_OC = [
  "recibida",
  "en_ejecucion",
  "parcialmente_facturada",
  "facturada",
  "anulada",
] as const;

function estadoVariant(estado: string | null) {
  if (estado === "facturada") return "default" as const;
  if (estado === "parcialmente_facturada") return "secondary" as const;
  if (estado === "en_ejecucion") return "secondary" as const;
  if (estado === "anulada") return "destructive" as const;
  return "outline" as const;
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

function computeEjecutado(oc: OCRow, servicios: ServicioRow[]) {
  if (!oc.numero_cliente) return 0;
  return servicios
    .filter((s) => s.folio_cliente === oc.numero_cliente && s.estado !== "anulado")
    .reduce((acc, s) => acc + Number(s.monto ?? 0), 0);
}

export const Route = createFileRoute("/_app/ordenes-compra")({
  component: OrdenesCompraPage,
});

function OrdenesCompraPage() {
  const queryClient = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected] = useState<OCRow | null>(null);

  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [clienteFilter, setClienteFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", "selector-oc"],
    queryFn: async (): Promise<ClienteMin[]> => {
      const { data, error } = await supabase.from("clientes").select("id,nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cotizacionesAprobadas = [] } = useQuery({
    queryKey: ["cotizaciones", "aprobadas"],
    queryFn: async (): Promise<CotizacionMin[]> => {
      const { data, error } = await supabase
        .from("cotizaciones")
        .select("id,numero,total,estado")
        .eq("estado", "aprobada")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ocs = [], isLoading } = useQuery({
    queryKey: ["ordenes-compra"],
    queryFn: async (): Promise<OCRow[]> => {
      const { data, error } = await supabase
        .from("ordenes_compra")
        .select("*, clientes(nombre), cotizaciones(numero)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OCRow[];
    },
  });

  const numerosCliente = useMemo(
    () => Array.from(new Set(ocs.map((o) => o.numero_cliente).filter(Boolean))) as string[],
    [ocs],
  );

  const { data: serviciosPorOC = [] } = useQuery({
    queryKey: ["ordenes-compra", "servicios", numerosCliente.join("|")],
    enabled: numerosCliente.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("id,folio_interno,folio_cliente,tipo_servicio,monto,estado,fecha_servicio")
        .in("folio_cliente", numerosCliente)
        .neq("estado", "anulado")
        .order("fecha_servicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ServicioRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ocs.filter((oc) => {
      if (estadoFilter !== "todos" && oc.estado !== estadoFilter) return false;
      if (clienteFilter !== "todos" && oc.cliente_id !== clienteFilter) return false;
      if (fechaDesde && (oc.fecha_recepcion ?? "") < fechaDesde) return false;
      if (fechaHasta && (oc.fecha_recepcion ?? "") > fechaHasta) return false;
      if (q) {
        const blob = [
          oc.numero_interno,
          oc.numero_cliente,
          oc.clientes?.nombre,
          oc.cotizaciones?.numero,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [ocs, estadoFilter, clienteFilter, fechaDesde, fechaHasta, search]);

  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
    const channel = supabase
      .channel("oc-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_compra" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "ordenes_servicio" }, invalidate)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Órdenes de compra</h1>
          <p className="text-sm text-muted-foreground">Registro de OC del cliente y avance de ejecución.</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nueva OC
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva orden de compra</DialogTitle>
              <DialogDescription>Sube el PDF (opcional) y registra el monto total.</DialogDescription>
            </DialogHeader>
            <OCForm
              clientes={clientes}
              cotizaciones={cotizacionesAprobadas}
              onCancel={() => setOpenCreate(false)}
              onCreated={() => setOpenCreate(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° interno, N° cliente, cliente..."
              className="pl-8"
            />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {ESTADOS_OC.map((e) => (
                  <SelectItem key={e} value={e} className="capitalize">
                    {e.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Cliente</Label>
            <Select value={clienteFilter} onValueChange={setClienteFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° interno</TableHead>
                <TableHead>N° cliente</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cotización</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Ejecutado</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    Sin órdenes de compra.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((oc) => {
                  const ejecutado = computeEjecutado(oc, serviciosPorOC);
                  const total = Number(oc.monto_total ?? 0);
                  const pct = total > 0 ? Math.min(100, (ejecutado / total) * 100) : 0;
                  const saldo = total - ejecutado;
                  return (
                    <TableRow key={oc.id}>
                      <TableCell className="font-medium">{oc.numero_interno ?? oc.id.slice(0, 8)}</TableCell>
                      <TableCell>{oc.numero_cliente ?? "—"}</TableCell>
                      <TableCell>{oc.clientes?.nombre ?? "—"}</TableCell>
                      <TableCell>{oc.cotizaciones?.numero ?? "—"}</TableCell>
                      <TableCell>{formatDate(oc.fecha_recepcion)}</TableCell>
                      <TableCell className="text-right">{formatCLP(total)}</TableCell>
                      <TableCell className="text-right">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">{formatCLP(ejecutado)}</div>
                          <Progress value={pct} />
                          <div className="text-[11px] text-muted-foreground">
                            Saldo: {formatCLP(saldo)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={estadoVariant(oc.estado)} className="capitalize">
                          {(oc.estado ?? "—").replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {oc.archivo_pdf_url && (
                            <Button asChild size="icon" variant="ghost" title="Descargar PDF">
                              <a href={oc.archivo_pdf_url} target="_blank" rel="noreferrer">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => setSelected(oc)}>
                            Ver
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle OC</DialogTitle>
            <DialogDescription>Servicios ejecutados se vinculan por folio_cliente.</DialogDescription>
          </DialogHeader>
          {selected && (
            <OCDetail
              oc={selected}
              clientes={clientes}
              cotizaciones={cotizacionesAprobadas}
              serviciosGlobal={serviciosPorOC}
              onUpdated={() => queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OCForm({
  clientes,
  cotizaciones,
  onCancel,
  onCreated,
}: {
  clientes: ClienteMin[];
  cotizaciones: CotizacionMin[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clienteId, setClienteId] = useState("");
  const [numeroCliente, setNumeroCliente] = useState("");
  const [cotizacionId, setCotizacionId] = useState("none");
  const [fechaRecepcion, setFechaRecepcion] = useState(() => new Date().toISOString().slice(0, 10));
  const [montoTotal, setMontoTotal] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (cotizacionId === "none") return;
    const c = cotizaciones.find((x) => x.id === cotizacionId);
    if (c && montoTotal.trim() === "") setMontoTotal(String(Number(c.total ?? 0)));
  }, [cotizacionId]);

  const submit = async () => {
    const parsed = createOCSchema.safeParse({
      cliente_id: clienteId,
      numero_cliente: numeroCliente || undefined,
      cotizacion_id: cotizacionId !== "none" ? cotizacionId : undefined,
      fecha_recepcion: fechaRecepcion,
      monto_total: montoTotal,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }

    setSubmitting(true);
    try {
      let archivoUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "pdf";
        const path = `oc/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("oc-clientes")
          .upload(path, file, { upsert: false, contentType: file.type });
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
            cotizacion_id: parsed.data.cotizacion_id ?? null,
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

      if (parsed.data.cotizacion_id) {
        const { error: cotErr } = await supabase
          .from("cotizaciones")
          .update({ estado: "facturada" })
          .eq("id", parsed.data.cotizacion_id);
        if (cotErr) throw cotErr;
      }

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "orden_compra",
        entity_id: ocId,
        action: "created",
        new_value: { numero_interno: numeroInterno, ...parsed.data, archivo_pdf_url: archivoUrl },
      });
      if (histErr) throw new Error(histErr.message);

      toast.success("OC creada");
      queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Error al crear");
    } finally {
      setSubmitting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="md:col-span-2">
        <Label>Cliente *</Label>
        <Select value={clienteId} onValueChange={setClienteId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona..." />
          </SelectTrigger>
          <SelectContent>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>N° OC cliente</Label>
        <Input value={numeroCliente} onChange={(e) => setNumeroCliente(e.target.value)} placeholder="Opcional" />
      </div>
      <div>
        <Label>Cotización origen</Label>
        <Select value={cotizacionId} onValueChange={setCotizacionId}>
          <SelectTrigger>
            <SelectValue placeholder="Opcional" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin cotización</SelectItem>
            {cotizaciones.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.numero ?? c.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Fecha recepción *</Label>
        <Input type="date" value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} />
      </div>
      <div>
        <Label>Monto total *</Label>
        <Input type="number" value={montoTotal} onChange={(e) => setMontoTotal(e.target.value)} placeholder="0" />
      </div>
      <div className="md:col-span-2">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="min-w-[220px] flex-1">
            <Label>PDF OC (opcional)</Label>
            <Input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <PDFImporter
            title="Analizar PDF"
            description="Extraemos N° OC, RUT, fecha y monto para pre-llenar."
            confirmLabel="Aplicar al formulario"
            onConfirm={async ({ file: f, values }) => {
              setFile(f);
              if (values.numeroOC.trim()) setNumeroCliente(values.numeroOC.trim());
              if (values.fecha.trim()) setFechaRecepcion(values.fecha.trim());
              if (values.montoTotal.trim()) setMontoTotal(values.montoTotal.trim());
              if (values.rutCliente.trim()) {
                const { data, error } = await supabase
                  .from("clientes")
                  .select("id")
                  .eq("rut", values.rutCliente.trim())
                  .maybeSingle();
                if (error) throw error;
                if (data?.id) setClienteId(data.id);
                else toast.message("RUT no encontrado", { description: "Selecciona el cliente manualmente." });
              }
            }}
          />
        </div>
      </div>

      <div className="md:col-span-2 flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? "Guardando..." : "Crear OC"}
        </Button>
      </div>
    </div>
  );
}

function OCDetail({
  oc,
  clientes,
  cotizaciones,
  serviciosGlobal,
  onUpdated,
}: {
  oc: OCRow;
  clientes: ClienteMin[];
  cotizaciones: CotizacionMin[];
  serviciosGlobal: ServicioRow[];
  onUpdated: () => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [clienteId, setClienteId] = useState(oc.cliente_id);
  const [numeroCliente, setNumeroCliente] = useState(oc.numero_cliente ?? "");
  const [cotizacionId, setCotizacionId] = useState<string>(oc.cotizacion_id ?? "none");
  const [fechaRecepcion, setFechaRecepcion] = useState((oc.fecha_recepcion ?? "").slice(0, 10));
  const [montoTotal, setMontoTotal] = useState(String(Number(oc.monto_total ?? 0)));
  const [estado, setEstado] = useState(oc.estado ?? "recibida");
  const [file, setFile] = useState<File | null>(null);
  const [updating, setUpdating] = useState(false);

  const servicios = useMemo(() => {
    if (!numeroCliente.trim()) return [];
    return serviciosGlobal.filter((s) => s.folio_cliente === numeroCliente && s.estado !== "anulado");
  }, [serviciosGlobal, numeroCliente]);

  const ejecutado = useMemo(() => servicios.reduce((s, x) => s + Number(x.monto ?? 0), 0), [servicios]);
  const total = Number(montoTotal ?? 0);
  const saldo = total - ejecutado;
  const pct = total > 0 ? Math.min(100, (ejecutado / total) * 100) : 0;

  const canEdit = (oc.estado ?? "recibida") !== "facturada";

  const allowedNext = useMemo(() => {
    const e = (estado ?? oc.estado ?? "recibida") as string;
    if (e === "recibida") return ["recibida", "en_ejecucion", "anulada"];
    if (e === "en_ejecucion") return ["en_ejecucion", "parcialmente_facturada", "facturada", "anulada"];
    if (e === "parcialmente_facturada") return ["parcialmente_facturada", "facturada", "anulada"];
    if (e === "facturada") return ["facturada"];
    if (e === "anulada") return ["anulada"];
    return ESTADOS_OC as unknown as string[];
  }, [estado, oc.estado]);

  const guardar = async () => {
    if (!canEdit) {
      toast.error("No se puede editar una OC facturada");
      return;
    }
    const parsed = createOCSchema.safeParse({
      cliente_id: clienteId,
      numero_cliente: numeroCliente || undefined,
      cotizacion_id: cotizacionId !== "none" ? cotizacionId : undefined,
      fecha_recepcion: fechaRecepcion,
      monto_total: montoTotal,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }

    setUpdating(true);
    try {
      let archivoUrl: string | null = oc.archivo_pdf_url ?? null;
      if (file) {
        const ext = file.name.split(".").pop() ?? "pdf";
        const path = `oc/${oc.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("oc-clientes")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        archivoUrl = supabase.storage.from("oc-clientes").getPublicUrl(path).data.publicUrl;
      }

      const { data: before, error: beforeErr } = await supabase
        .from("ordenes_compra")
        .select("*")
        .eq("id", oc.id)
        .single();
      if (beforeErr) throw beforeErr;

      const { error } = await supabase
        .from("ordenes_compra")
        .update({
          cliente_id: parsed.data.cliente_id,
          numero_cliente: parsed.data.numero_cliente ?? null,
          cotizacion_id: parsed.data.cotizacion_id ?? null,
          fecha_recepcion: parsed.data.fecha_recepcion,
          monto_total: Number(parsed.data.monto_total ?? 0),
          monto_ejecutado: ejecutado,
          estado,
          archivo_pdf_url: archivoUrl,
        })
        .eq("id", oc.id);
      if (error) throw error;

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "orden_compra",
        entity_id: oc.id,
        action: "updated",
        old_value: before,
        new_value: { ...parsed.data, monto_ejecutado: ejecutado, estado, archivo_pdf_url: archivoUrl },
      });
      if (histErr) throw new Error(histErr.message);

      toast.success("OC actualizada");
      queryClient.invalidateQueries({ queryKey: ["ordenes-compra"] });
      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onUpdated();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setUpdating(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">
            {oc.numero_interno ?? oc.id.slice(0, 8)} · {oc.clientes?.nombre ?? "Cliente"}
          </CardTitle>
          <div className="text-right text-sm">
            <div className="text-xs text-muted-foreground">Ejecución</div>
            <div className="font-semibold">
              {formatCLP(ejecutado)} / {formatCLP(total)}
            </div>
            <Progress value={pct} />
            <div className="text-xs text-muted-foreground mt-1">Saldo: {formatCLP(saldo)}</div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <Label>Cliente *</Label>
            <Select value={clienteId} onValueChange={setClienteId} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>N° OC cliente</Label>
            <Input value={numeroCliente} onChange={(e) => setNumeroCliente(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <Label>Cotización origen</Label>
            <Select value={cotizacionId} onValueChange={setCotizacionId} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin cotización</SelectItem>
                {cotizaciones.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.numero ?? c.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fecha recepción *</Label>
            <Input type="date" value={fechaRecepcion} onChange={(e) => setFechaRecepcion(e.target.value)} disabled={!canEdit} />
          </div>
          <div>
            <Label>Monto total *</Label>
            <Input type="number" value={montoTotal} onChange={(e) => setMontoTotal(e.target.value)} disabled={!canEdit} />
          </div>
          <div className="md:col-span-2">
            <Label>Estado</Label>
            <Select value={estado} onValueChange={setEstado} disabled={!canEdit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedNext.map((e) => (
                  <SelectItem key={e} value={e} className="capitalize">
                    {e.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>PDF OC (opcional)</Label>
            <div className="flex gap-2 items-center">
              <Input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={!canEdit}
              />
              {oc.archivo_pdf_url && (
                <Button asChild variant="outline" size="icon" title="Ver PDF">
                  <a href={oc.archivo_pdf_url} target="_blank" rel="noreferrer">
                    <FileText className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={guardar} disabled={updating || !canEdit}>
              {updating ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Servicios ejecutados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {numeroCliente.trim() === "" ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Para listar servicios, define el N° OC cliente y asegúrate de usarlo como folio_cliente en las órdenes.
                  </TableCell>
                </TableRow>
              ) : servicios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Sin servicios asociados a esta OC.
                  </TableCell>
                </TableRow>
              ) : (
                servicios.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.folio_interno ?? s.id.slice(0, 8)}</TableCell>
                    <TableCell>{formatDate(s.fecha_servicio)}</TableCell>
                    <TableCell className="capitalize">{s.tipo_servicio ?? "—"}</TableCell>
                    <TableCell className="capitalize">
                      <Badge variant="outline">{(s.estado ?? "—").replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCLP(s.monto ?? 0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
