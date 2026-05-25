import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { formatCLP, formatDate } from "@/lib/format";
import { createCotizacionSchema } from "@/lib/validations/cotizaciones";

type ClienteMin = { id: string; nombre: string; rut: string | null };

type CotizacionRow = {
  id: string;
  numero: string | null;
  cliente_id: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  total: number | null;
  estado: string | null;
  clientes: { nombre: string; rut: string | null } | null;
  cotizacion_lineas: Array<{ id: string }> | null;
};

const ESTADOS: Array<{ value: string; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "borrador", label: "Borradores" },
  { value: "enviada", label: "Enviadas" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "vencida", label: "Vencidas" },
  { value: "facturada", label: "Facturadas" },
];

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

export const Route = createFileRoute("/_app/cotizaciones")({
  component: CotizacionesPage,
});

function CotizacionesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tabEstado, setTabEstado] = useState("todas");
  const [openCreate, setOpenCreate] = useState(false);

  const [search, setSearch] = useState("");
  const [clienteFilter, setClienteFilter] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", "selector-cotizaciones"],
    queryFn: async (): Promise<ClienteMin[]> => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nombre,rut")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ["cotizaciones"],
    queryFn: async (): Promise<CotizacionRow[]> => {
      const { data, error } = await supabase
        .from("cotizaciones")
        .select(
          "id,numero,cliente_id,fecha_emision,fecha_vencimiento,total,estado, clientes(nombre,rut), cotizacion_lineas(id)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CotizacionRow[];
    },
  });

  const { data: ordenesCompra = [] } = useQuery({
    queryKey: ["ordenes-compra", "por-cotizacion"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_compra")
        .select("id,cotizacion_id,numero_interno,numero_cliente")
        .not("cotizacion_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const ocByCotizacion = useMemo(() => {
    const map = new Map<string, { id: string; numero_interno: string | null; numero_cliente: string | null }>();
    for (const oc of ordenesCompra as any[]) {
      if (!oc.cotizacion_id) continue;
      map.set(oc.cotizacion_id, {
        id: oc.id,
        numero_interno: oc.numero_interno ?? null,
        numero_cliente: oc.numero_cliente ?? null,
      });
    }
    return map;
  }, [ordenesCompra]);

  const vencenPronto = useMemo(() => {
    const now = new Date();
    const in2 = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).toISOString().slice(0, 10);
    return cotizaciones.filter(
      (c) =>
        c.estado === "enviada" &&
        !!c.fecha_vencimiento &&
        c.fecha_vencimiento <= in2 &&
        c.fecha_vencimiento >= now.toISOString().slice(0, 10),
    ).length;
  }, [cotizaciones]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cotizaciones.filter((c) => {
      if (tabEstado !== "todas" && c.estado !== tabEstado) return false;
      if (clienteFilter !== "todos" && c.cliente_id !== clienteFilter) return false;
      if (fechaDesde && (c.fecha_emision ?? "") < fechaDesde) return false;
      if (fechaHasta && (c.fecha_emision ?? "") > fechaHasta) return false;
      if (q) {
        const oc = ocByCotizacion.get(c.id);
        const blob = [
          c.numero,
          c.clientes?.nombre,
          c.clientes?.rut,
          oc?.numero_interno,
          oc?.numero_cliente,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [cotizaciones, ocByCotizacion, search, tabEstado, clienteFilter, fechaDesde, fechaHasta]);

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
    };
    const channel = supabase
      .channel("cotizaciones-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cotizaciones" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cotizacion_lineas" },
        invalidate,
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Cotiza servicios y gestiona su estado.</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nueva cotización
        </Button>
      </div>

      <Tabs value={tabEstado} onValueChange={setTabEstado}>
        <TabsList className="flex flex-wrap">
          {ESTADOS.map((e) => (
            <TabsTrigger key={e.value} value={e.value} className="gap-2">
              {e.label}
              {e.value === "enviada" && vencenPronto > 0 && (
                <Badge variant="destructive" className="h-5 px-2">
                  {vencenPronto}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tabEstado} className="space-y-4">
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
                  placeholder="N° cotización, cliente, OC..."
                  className="pl-8"
                />
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
                    <TableHead>N°</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Emisión</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead className="text-right">Líneas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>OC</TableHead>
                    <TableHead className="text-right">Ver</TableHead>
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
                        Sin cotizaciones.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.numero ?? c.id.slice(0, 8)}</TableCell>
                        <TableCell>{c.clientes?.nombre ?? "—"}</TableCell>
                        <TableCell>{formatDate(c.fecha_emision)}</TableCell>
                        <TableCell>{formatDate(c.fecha_vencimiento)}</TableCell>
                        <TableCell className="text-right">{c.cotizacion_lineas?.length ?? 0}</TableCell>
                        <TableCell className="text-right">{formatCLP(c.total ?? 0)}</TableCell>
                        <TableCell>
                          <Badge variant={estadoVariant(c.estado)} className="capitalize">
                            {c.estado ?? "—"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {ocByCotizacion.get(c.id)?.numero_interno ??
                            ocByCotizacion.get(c.id)?.numero_cliente ??
                            "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/cotizaciones/$cotizacionId" params={{ cotizacionId: c.id }}>
                              Ver
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva cotización</DialogTitle>
            <DialogDescription>Agrega líneas y calcula totales en tiempo real.</DialogDescription>
          </DialogHeader>
          <CotizacionForm
            clientes={clientes}
            onCancel={() => setOpenCreate(false)}
            onCreated={(id) => {
              setOpenCreate(false);
              navigate({ to: "/cotizaciones/$cotizacionId", params: { cotizacionId: id } });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CotizacionForm({
  clientes,
  onCancel,
  onCreated,
}: {
  clientes: ClienteMin[];
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [clienteId, setClienteId] = useState<string>("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [fechaVenc, setFechaVenc] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [condPago, setCondPago] = useState<string>("0");
  const [ivaIncluido, setIvaIncluido] = useState(true);
  const [obs, setObs] = useState("");
  const [lineas, setLineas] = useState<Array<any>>([
    { descripcion: "", cantidad: 1, precio_unitario: 0, descuento: 0, orden_id: undefined },
  ]);

  const filteredClientes = useMemo(() => {
    const q = clienteSearch.trim().toLowerCase();
    if (!q) return clientes.slice(0, 50);
    return clientes
      .filter((c) => (c.nombre ?? "").toLowerCase().includes(q) || (c.rut ?? "").toLowerCase().includes(q))
      .slice(0, 50);
  }, [clientes, clienteSearch]);

  const { lineasConTotal, subtotal, iva, total } = useMemo(
    () => calcTotales(lineas, ivaIncluido),
    [lineas, ivaIncluido],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
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

      let numero = "";
      let createdId = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        numero = await generarNumeroCotizacion();
        const { data: cot, error: insErr } = await supabase
          .from("cotizaciones")
          .insert({
            numero,
            cliente_id: parsed.data.cliente_id,
            fecha_emision: new Date().toISOString().slice(0, 10),
            fecha_vencimiento: parsed.data.fecha_vencimiento,
            condicion_pago: Number(parsed.data.condicion_pago ?? 0),
            iva_incluido: parsed.data.iva_incluido,
            observaciones: parsed.data.observaciones ?? null,
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
        createdId = (cot as any).id as string;
        break;
      }
      if (!createdId) throw new Error("No se pudo generar número de cotización");

      const lineasPayload = lineasConTotal.map((l) => ({
        cotizacion_id: createdId,
        orden_id: l.orden_id ?? null,
        descripcion: l.descripcion,
        cantidad: Math.round(Number(l.cantidad ?? 0)),
        precio_unitario: Number(l.precio_unitario ?? 0),
        descuento: Number(l.descuento ?? 0),
        total_linea: Number(l.total_linea ?? 0),
      }));
      const { error: lineasErr } = await supabase.from("cotizacion_lineas").insert(lineasPayload);
      if (lineasErr) throw lineasErr;

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "cotizacion",
        entity_id: createdId,
        action: "created",
        new_value: { numero, ...parsed.data, subtotal, iva, total },
      });
      if (histErr) throw new Error(histErr.message);

      queryClient.invalidateQueries({ queryKey: ["cotizaciones"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      return createdId;
    },
    onSuccess: (id) => {
      toast.success("Cotización creada");
      onCreated(id);
    },
    onError: (e: any) => toast.error(e.message ?? "Error al crear"),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Encabezado</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Buscar cliente</Label>
              <Input
                value={clienteSearch}
                onChange={(e) => setClienteSearch(e.target.value)}
                placeholder="Nombre o RUT..."
              />
            </div>
            <div className="md:col-span-2">
              <Label>Cliente *</Label>
              <Select value={clienteId} onValueChange={setClienteId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredClientes.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">Sin resultados</div>
                  ) : (
                    filteredClientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nombre} {c.rut ? `· ${c.rut}` : ""}
                      </SelectItem>
                    ))
                  )}
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
            <div className="md:col-span-2 flex items-center justify-between gap-3 rounded-md border p-3">
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
            <div className="md:col-span-2">
              <Label>Observaciones</Label>
              <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Líneas</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setLineas((prev) => [
                  ...prev,
                  { descripcion: "", cantidad: 1, precio_unitario: 0, descuento: 0, orden_id: undefined },
                ])
              }
            >
              + Agregar línea
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lineasConTotal.map((l, idx) => (
              <LineaEditor
                key={idx}
                value={l}
                onChange={(next) =>
                  setLineas((prev) => prev.map((x, i) => (i === idx ? next : x)))
                }
                onRemove={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                disableRemove={lineasConTotal.length === 1}
              />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Totales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
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
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creando..." : "Crear cotización"}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

function LineaEditor({
  value,
  onChange,
  onRemove,
  disableRemove,
}: {
  value: any;
  onChange: (next: any) => void;
  onRemove: () => void;
  disableRemove: boolean;
}) {
  const [ordenSearch, setOrdenSearch] = useState("");
  const ordenId = value.orden_id ?? "none";

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ["ordenes", "search", ordenSearch],
    enabled: ordenSearch.trim().length >= 2,
    queryFn: async () => {
      const q = ordenSearch.trim();
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("id, folio_interno, folio_cliente, clientes(nombre)")
        .or(`folio_interno.ilike.%${q}%,folio_cliente.ilike.%${q}%`)
        .order("fecha_servicio", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-6">
          <Label className="text-xs">Descripción *</Label>
          <Input
            value={value.descripcion}
            onChange={(e) => onChange({ ...value, descripcion: e.target.value })}
            placeholder="Descripción del servicio..."
          />
        </div>

        <div className="md:col-span-3">
          <Label className="text-xs">Buscar orden (opcional)</Label>
          <Input
            value={ordenSearch}
            onChange={(e) => setOrdenSearch(e.target.value)}
            placeholder="Folio interno o folio cliente…"
          />
        </div>
        <div className="md:col-span-3">
          <Label className="text-xs">Orden vinculada</Label>
          <Select
            value={ordenId}
            onValueChange={(nextOrdenId) =>
              onChange({ ...value, orden_id: nextOrdenId === "none" ? undefined : nextOrdenId })
            }
            disabled={ordenSearch.trim().length > 0 && ordenSearch.trim().length < 2}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  ordenSearch.trim().length > 0 && ordenSearch.trim().length < 2
                    ? "Escribe 2+ caracteres"
                    : isLoading
                      ? "Buscando…"
                      : "Opcional"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin orden</SelectItem>
              {ordenes.length === 0 ? (
                <div className="p-2 text-sm text-muted-foreground">Sin resultados</div>
              ) : (
                ordenes.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {(o.folio_interno ?? "Sin folio") +
                      (o.clientes?.nombre ? ` · ${o.clientes.nombre}` : "")}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Label className="text-xs">Cantidad *</Label>
          <Input
            type="number"
            value={String(value.cantidad ?? 1)}
            onChange={(e) => onChange({ ...value, cantidad: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Precio unitario *</Label>
          <Input
            type="number"
            value={String(value.precio_unitario ?? 0)}
            onChange={(e) => onChange({ ...value, precio_unitario: e.target.value })}
          />
        </div>
        <div className="md:col-span-2">
          <Label className="text-xs">Descuento %</Label>
          <Input
            type="number"
            value={String(value.descuento ?? 0)}
            onChange={(e) => onChange({ ...value, descuento: e.target.value })}
          />
        </div>

        <div className="md:col-span-6 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Total línea: <span className="font-medium text-foreground">{formatCLP(value.total_linea ?? 0)}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onRemove} disabled={disableRemove}>
            Quitar
          </Button>
        </div>
      </div>
    </div>
  );
}
