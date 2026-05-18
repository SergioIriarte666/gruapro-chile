import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  ESTADO_CIERRE_OPTIONS,
  estadoCierreLabel,
  estadoCierreVariant,
} from "@/lib/cierres-options";
import { formatCLP, formatDate } from "@/lib/format";
import { NuevoCierreDialog } from "@/components/cierres/nuevo-cierre-dialog";

type CierreRow = {
  id: string;
  numero: string | null;
  estado: string | null;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  total: number | null;
  folio_cliente: string | null;
  cliente_id: string;
  created_at: string | null;
  clientes: { nombre: string; requiere_folio: boolean | null } | null;
};

export const Route = createFileRoute("/_app/cierres/")({
  component: CierresIndex,
});

function CierresIndex() {
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("all");
  const [mes, setMes] = useState<string>("all");
  const [nuevoOpen, setNuevoOpen] = useState(false);

  const { data: cierres = [], isLoading } = useQuery({
    queryKey: ["cierres"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("*, clientes(nombre,requiere_folio)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CierreRow[];
    },
  });

  const { data: clientesOpts = [] } = useQuery({
    queryKey: ["clientes-opts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clientes").select("id,nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Conteo de servicios por cierre
  const { data: conteos = {} } = useQuery({
    queryKey: ["cierres-conteo"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cierre_servicios").select("cierre_id");
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        map[(r as any).cierre_id] = (map[(r as any).cierre_id] ?? 0) + 1;
      }
      return map;
    },
  });

  const filtrados = useMemo(() => {
    return cierres.filter((c) => {
      if (estado !== "all" && c.estado !== estado) return false;
      if (clienteFilter !== "all" && c.cliente_id !== clienteFilter) return false;
      if (mes !== "all" && c.periodo_inicio) {
        const ym = c.periodo_inicio.slice(0, 7);
        if (ym !== mes) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const matches =
          (c.numero ?? "").toLowerCase().includes(q) ||
          (c.clientes?.nombre ?? "").toLowerCase().includes(q) ||
          (c.folio_cliente ?? "").toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [cierres, estado, clienteFilter, mes, search]);

  // Opciones de mes (últimos 12)
  const mesesOpts = useMemo(() => {
    const set = new Set<string>();
    for (const c of cierres) if (c.periodo_inicio) set.add(c.periodo_inicio.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [cierres]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cierres de período</h1>
          <p className="text-sm text-muted-foreground">
            Consolida servicios completados en cierres facturables por cliente.
          </p>
        </div>
        <Button onClick={() => setNuevoOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo cierre
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="N°, cliente o folio…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {ESTADO_CIERRE_OPTIONS.map((o) => (
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
              <SelectItem value="all">Todos los clientes</SelectItem>
              {clientesOpts.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los períodos</SelectItem>
              {mesesOpts.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° cierre</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="text-right">N° servicios</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Folio cliente</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Cargando…
                  </TableCell>
                </TableRow>
              ) : filtrados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
                    Sin resultados.
                  </TableCell>
                </TableRow>
              ) : (
                filtrados.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.numero ?? c.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      {c.clientes?.nombre ?? "—"}
                      {c.clientes?.requiere_folio && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Requiere folio
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDate(c.periodo_inicio)} → {formatDate(c.periodo_fin)}
                    </TableCell>
                    <TableCell className="text-right">{conteos[c.id] ?? 0}</TableCell>
                    <TableCell className="text-right">{formatCLP(c.total)}</TableCell>
                    <TableCell>{c.folio_cliente ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={estadoCierreVariant(c.estado)}>
                        {estadoCierreLabel(c.estado)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="icon">
                        <Link to="/cierres/$cierreId" params={{ cierreId: c.id }}>
                          <Eye className="h-4 w-4" />
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

      <NuevoCierreDialog open={nuevoOpen} onOpenChange={setNuevoOpen} />
    </div>
  );
}
