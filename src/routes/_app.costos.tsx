import { ExcelImporter } from "@/components/excel-importer";
import { DteXmlImporter } from "@/components/dte-xml-importer";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { formatCLP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/costos")({
  component: CostosPage,
});

const MEDIO_PAGO = ["transferencia", "efectivo", "tarjeta", "cheque", "credito"];
const TIPO_COSTO = [
  { value: "servicio", label: "Por servicio" },
  { value: "operacional", label: "Operacional" },
];

type Categoria = { id: string; nombre: string; tipo: string | null; activa: boolean | null };
type Subcategoria = {
  id: string;
  nombre: string;
  categoria_id: string;
  aplica_a: string | null;
  activa: boolean | null;
};
type Costo = {
  id: string;
  fecha: string;
  monto: number;
  tipo: string | null;
  medio_pago: string | null;
  numero_documento: string | null;
  descripcion: string | null;
  archivo_url: string | null;
  categoria_id: string | null;
  subcategoria_id: string | null;
  grua_id: string | null;
  proveedor_id: string | null;
  categorias_costo: { nombre: string } | null;
  subcategorias_costo: { nombre: string } | null;
  gruas: { patente: string } | null;
  proveedores: { nombre: string } | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

function CostosPage() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [fechaDesde, setFechaDesde] = useState(firstOfMonth());
  const [fechaHasta, setFechaHasta] = useState(today());
  const [filtroCat, setFiltroCat] = useState<string>("all");
  const [filtroSub, setFiltroSub] = useState<string>("all");
  const [filtroGrua, setFiltroGrua] = useState<string>("all");
  const [filtroTipo, setFiltroTipo] = useState<string>("all");

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias-costo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias_costo")
        .select("*")
        .eq("activa", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Categoria[];
    },
  });

  const { data: subcategorias = [] } = useQuery({
    queryKey: ["subcategorias-costo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subcategorias_costo")
        .select("*")
        .eq("activa", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Subcategoria[];
    },
  });

  const { data: gruas = [] } = useQuery({
    queryKey: ["gruas-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gruas")
        .select("id,patente")
        .order("patente");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proveedores")
        .select("id,nombre")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: costos = [], isLoading } = useQuery({
    queryKey: ["costos", fechaDesde, fechaHasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos")
        .select(
          "*, categorias_costo(nombre), subcategorias_costo(nombre), gruas(patente), proveedores(nombre)",
        )
        .gte("fecha", fechaDesde)
        .lte("fecha", fechaHasta)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Costo[];
    },
  });

  // Ingresos del período para margen
  const { data: ingresos = 0 } = useQuery({
    queryKey: ["ingresos-periodo", fechaDesde, fechaHasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("monto")
        .eq("estado", "completado")
        .gte("fecha_servicio", fechaDesde)
        .lte("fecha_servicio", `${fechaHasta}T23:59:59`);
      if (error) throw error;
      return (data ?? []).reduce((s, r: any) => s + Number(r.monto ?? 0), 0);
    },
  });

  const filtrados = useMemo(() => {
    return costos.filter((c) => {
      if (filtroCat !== "all" && c.categoria_id !== filtroCat) return false;
      if (filtroSub !== "all" && c.subcategoria_id !== filtroSub) return false;
      if (filtroGrua !== "all" && c.grua_id !== filtroGrua) return false;
      if (filtroTipo !== "all" && c.tipo !== filtroTipo) return false;
      if (search) {
        const q = search.toLowerCase();
        const m =
          (c.descripcion ?? "").toLowerCase().includes(q) ||
          (c.numero_documento ?? "").toLowerCase().includes(q) ||
          (c.proveedores?.nombre ?? "").toLowerCase().includes(q);
        if (!m) return false;
      }
      return true;
    });
  }, [costos, filtroCat, filtroSub, filtroGrua, filtroTipo, search]);

  const totalCostos = filtrados.reduce((s, c) => s + Number(c.monto ?? 0), 0);
  const margen = ingresos - totalCostos;

  const datosGrafico = useMemo(() => {
    const map: Record<string, { nombre: string; monto: number }> = {};
    for (const c of filtrados) {
      const k = c.categorias_costo?.nombre ?? "Sin categoría";
      if (!map[k]) map[k] = { nombre: k, monto: 0 };
      map[k].monto += Number(c.monto ?? 0);
    }
    return Object.values(map).sort((a, b) => b.monto - a.monto);
  }, [filtrados]);

  const queryClient = useQueryClient();
  const eliminar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("costos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Costo eliminado");
      queryClient.invalidateQueries({ queryKey: ["costos"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Costos</h1>
          <p className="text-sm text-muted-foreground">
            Registro de gastos operacionales y por servicio.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DteXmlImporter
            categorias={categorias as any}
            subcategorias={subcategorias as any}
            invalidateKeys={[["costos"]]}
          />
          <ExcelImporter modulo="costos" invalidateKeys={[["costos"]]} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Nuevo costo
              </Button>
            </DialogTrigger>
            <NuevoCostoDialog
              onClose={() => setOpen(false)}
              categorias={categorias}
              subcategorias={subcategorias}
              gruas={gruas as any}
              proveedores={proveedores as any}
            />
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Período y filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Categoría</Label>
            <Select value={filtroCat} onValueChange={setFiltroCat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Subcategoría</Label>
            <Select value={filtroSub} onValueChange={setFiltroSub}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {subcategorias
                  .filter((s) => filtroCat === "all" || s.categoria_id === filtroCat)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Grúa</Label>
            <Select value={filtroGrua} onValueChange={setFiltroGrua}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {(gruas as any[]).map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.patente}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPO_COSTO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="listado">
        <TabsList>
          <TabsTrigger value="listado">Listado</TabsTrigger>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
        </TabsList>

        <TabsContent value="listado" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Descripción, documento o proveedor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Subcategoría</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Grúa</TableHead>
                    <TableHead>Doc.</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>
                  ) : filtrados.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Sin costos en el período.</TableCell></TableRow>
                  ) : filtrados.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{formatDate(c.fecha)}</TableCell>
                      <TableCell>{c.categorias_costo?.nombre ?? "—"}</TableCell>
                      <TableCell>{c.subcategorias_costo?.nombre ?? "—"}</TableCell>
                      <TableCell>{c.proveedores?.nombre ?? "—"}</TableCell>
                      <TableCell>{c.gruas?.patente ?? "—"}</TableCell>
                      <TableCell>{c.numero_documento ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatCLP(c.monto)}</TableCell>
                      <TableCell className="flex gap-1">
                        {c.archivo_url && (
                          <Button asChild variant="ghost" size="icon" title="Ver comprobante">
                            <a href={c.archivo_url} target="_blank" rel="noreferrer">
                              <FileText className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("¿Eliminar este costo?")) eliminar.mutate(c.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {filtrados.length > 0 && (
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td colSpan={6} className="p-3 text-right">Total:</td>
                      <td className="p-3 text-right">{formatCLP(totalCostos)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumen" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ingresos</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold">{formatCLP(ingresos)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Costos</CardTitle></CardHeader>
              <CardContent className="text-2xl font-semibold text-destructive">{formatCLP(totalCostos)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Margen</CardTitle></CardHeader>
              <CardContent className={`text-2xl font-semibold ${margen >= 0 ? "text-green-600" : "text-destructive"}`}>
                {formatCLP(margen)}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Costos por categoría</CardTitle></CardHeader>
            <CardContent style={{ height: 400 }}>
              {datosGrafico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos para graficar.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosGrafico} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => formatCLP(v)} />
                    <YAxis type="category" dataKey="nombre" width={120} />
                    <Tooltip formatter={(v: number) => formatCLP(v)} />
                    <Bar dataKey="monto" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Nuevo costo dialog ----------
function NuevoCostoDialog({
  onClose,
  categorias,
  subcategorias,
  gruas,
  proveedores,
}: {
  onClose: () => void;
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  gruas: { id: string; patente: string }[];
  proveedores: { id: string; nombre: string }[];
}) {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(today());
  const [tipo, setTipo] = useState<string>("operacional");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [subcategoriaId, setSubcategoriaId] = useState<string>("");
  const [monto, setMonto] = useState<string>("");
  const [medio, setMedio] = useState<string>("transferencia");
  const [numDoc, setNumDoc] = useState("");
  const [gruaId, setGruaId] = useState<string>("none");
  const [proveedorId, setProveedorId] = useState<string>("none");
  const [descripcion, setDescripcion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setSubcategoriaId(""), [categoriaId]);

  const subsFiltradas = subcategorias.filter(
    (s) =>
      s.categoria_id === categoriaId &&
      (!s.aplica_a || s.aplica_a === "ambos" || s.aplica_a === tipo),
  );

  const submit = async () => {
    if (!categoriaId || !monto) {
      toast.error("Categoría y monto son obligatorios");
      return;
    }
    setSubmitting(true);
    try {
      let archivoUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("comprobantes")
          .upload(path, file);
        if (upErr) throw upErr;
        archivoUrl = supabase.storage.from("comprobantes").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase.from("costos").insert({
        fecha,
        tipo,
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId || null,
        monto: Number(monto),
        medio_pago: medio,
        numero_documento: numDoc || null,
        grua_id: gruaId !== "none" ? gruaId : null,
        proveedor_id: proveedorId !== "none" ? proveedorId : null,
        descripcion: descripcion || null,
        archivo_url: archivoUrl,
      });
      if (error) throw error;
      toast.success("Costo registrado");
      queryClient.invalidateQueries({ queryKey: ["costos"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nuevo costo</DialogTitle>
        <DialogDescription>Registra un gasto y adjunta el comprobante.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label>Fecha *</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPO_COSTO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Categoría *</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId}>
            <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>
              {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subcategoría</Label>
          <Select value={subcategoriaId} onValueChange={setSubcategoriaId} disabled={!categoriaId}>
            <SelectTrigger><SelectValue placeholder={categoriaId ? "Selecciona…" : "Elige categoría primero"} /></SelectTrigger>
            <SelectContent>
              {subsFiltradas.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Monto *</Label>
          <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label>Medio de pago</Label>
          <Select value={medio} onValueChange={setMedio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MEDIO_PAGO.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>N° documento</Label>
          <Input value={numDoc} onChange={(e) => setNumDoc(e.target.value)} placeholder="Boleta/factura" />
        </div>
        <div>
          <Label>Grúa asociada</Label>
          <Select value={gruaId} onValueChange={setGruaId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguna</SelectItem>
              {gruas.map((g) => <SelectItem key={g.id} value={g.id}>{g.patente}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Proveedor</Label>
          <Select value={proveedorId} onValueChange={setProveedorId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguno</SelectItem>
              {proveedores.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <Label>Descripción</Label>
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
        </div>
        <div className="md:col-span-2">
          <Label>Comprobante (foto/PDF)</Label>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={submit} disabled={submitting}>{submitting ? "Guardando…" : "Guardar costo"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
