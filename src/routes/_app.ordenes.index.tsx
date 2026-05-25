import { ExcelImporter } from "@/components/excel-importer";
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Eye, Plus, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NuevaOrdenWizard } from "@/components/ordenes/nueva-orden-wizard";
import {
  ESTADO_ORDEN_OPTIONS,
  TIPO_SERVICIO_OPTIONS,
  estadoOrdenVariant,
} from "@/lib/ordenes-options";
import { formatCLP, formatDateTime } from "@/lib/format";

type OrdenRow = {
  id: string;
  folio_interno: string | null;
  folio_cliente: string | null;
  tipo_servicio: string | null;
  estado: string | null;
  monto: number | null;
  fecha_servicio: string | null;
  created_at: string | null;
  cliente_id: string;
  clientes: { nombre: string } | null;
  gruas: { patente: string; marca: string | null; modelo: string | null } | null;
  operadores: { nombre: string } | null;
  clientes_vehiculos:
    | {
        patente: string | null;
        vehiculos_catalogo: { marca: string; modelo: string } | null;
      }
    | null;
};

function OrdenesPage() {
  const navigate = useNavigate();
  const [openCreate, setOpenCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("todos");
  const [tipoFilter, setTipoFilter] = useState("todos");
  const [clienteFilter, setClienteFilter] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ["ordenes"],
    queryFn: async (): Promise<OrdenRow[]> => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select(
          `id, folio_interno, folio_cliente, tipo_servicio, estado, monto, fecha_servicio, created_at, cliente_id,
           clientes(nombre),
           gruas(patente,marca,modelo),
           operadores(nombre),
           clientes_vehiculos(patente, vehiculos_catalogo(marca,modelo))`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrdenRow[];
    },
  });

  const { data: clientesList = [] } = useQuery({
    queryKey: ["clientes", "lista-filtro"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nombre")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ordenes.filter((o) => {
      if (estadoFilter !== "todos" && o.estado !== estadoFilter) return false;
      if (tipoFilter !== "todos" && o.tipo_servicio !== tipoFilter) return false;
      if (clienteFilter !== "todos" && o.cliente_id !== clienteFilter) return false;
      if (fechaDesde && o.fecha_servicio && o.fecha_servicio < fechaDesde) return false;
      if (fechaHasta && o.fecha_servicio && o.fecha_servicio > fechaHasta + "T23:59:59")
        return false;
      if (q) {
        const blob = [
          o.folio_interno,
          o.folio_cliente,
          o.clientes?.nombre,
          o.gruas?.patente,
          o.operadores?.nombre,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [
    ordenes,
    search,
    estadoFilter,
    tipoFilter,
    clienteFilter,
    fechaDesde,
    fechaHasta,
  ]);

  function vehiculoLabel(o: OrdenRow): string {
    const cv = o.clientes_vehiculos;
    if (!cv) return "—";
    const cat = cv.vehiculos_catalogo;
    const base = cat ? `${cat.marca} ${cat.modelo}` : "";
    const pat = cv.patente ?? "";
    return [base, pat].filter(Boolean).join(" · ") || "—";
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Órdenes de servicio</CardTitle>
          <div className="flex gap-2">
            <ExcelImporter modulo="servicios" invalidateKeys={[["ordenes"]]} />
            <Button onClick={() => setOpenCreate(true)}>
              <Plus /> Nueva orden
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Folio, cliente, grúa..."
                className="pl-8"
              />
            </div>
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {ESTADO_ORDEN_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {TIPO_SERVICIO_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={clienteFilter} onValueChange={setClienteFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los clientes</SelectItem>
                {clientesList.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                title="Desde"
              />
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                title="Hasta"
              />
            </div>
          </div>

          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Folio cliente</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Operador</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Sin órdenes que coincidan.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.folio_interno ?? "—"}</TableCell>
                      <TableCell>{o.folio_cliente ?? "—"}</TableCell>
                      <TableCell>{o.clientes?.nombre ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{vehiculoLabel(o)}</TableCell>
                      <TableCell className="capitalize">{o.tipo_servicio ?? "—"}</TableCell>
                      <TableCell>{o.operadores?.nombre ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatCLP(o.monto)}</TableCell>
                      <TableCell>
                        <Badge variant={estadoOrdenVariant(o.estado)} className="capitalize">
                          {o.estado ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(o.fecha_servicio)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="icon" variant="ghost">
                          <Link to="/ordenes/$ordenId" params={{ ordenId: o.id }}>
                            <Eye />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="text-sm text-muted-foreground">
            {filtered.length} órdenes
          </div>
        </CardContent>
      </Card>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva orden de servicio</DialogTitle>
            <DialogDescription>
              Completa los pasos para generar la orden. El folio interno se asigna automáticamente.
            </DialogDescription>
          </DialogHeader>
          <NuevaOrdenWizard
            onCancel={() => setOpenCreate(false)}
            onCreated={(id) => {
              setOpenCreate(false);
              navigate({ to: "/ordenes/$ordenId", params: { ordenId: id } });
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_app/ordenes/")({
  component: OrdenesPage,
});
