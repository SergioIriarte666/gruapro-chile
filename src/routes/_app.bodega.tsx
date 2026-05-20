import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createItemSchema, createMovimientoSchema } from "@/lib/validations/bodega";

type ItemRow = {
  id: string;
  nombre: string;
  stock_actual: number | null;
  stock_minimo: number | null;
  unidad: string | null;
  precio_costo: number | null;
  ubicacion: string | null;
  proveedor_id: string | null;
  subcategoria_id: string | null;
  proveedores: { nombre: string } | null;
  subcategorias_costo: { nombre: string; categorias_costo: { nombre: string } | null } | null;
};

type MovimientoRow = {
  id: string;
  item_id: string;
  orden_id: string | null;
  grua_id: string | null;
  tipo: string | null;
  cantidad: number;
  fecha: string | null;
  descripcion: string | null;
  bodega_items: { nombre: string } | null;
  ordenes_servicio: { folio_interno: string | null } | null;
  gruas: { patente: string } | null;
};

type ProveedorMin = { id: string; nombre: string };
type SubcatMin = { id: string; nombre: string; categoria_id: string; categorias_costo: { nombre: string } | null };
type CatMin = { id: string; nombre: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function stockVariant(item: ItemRow) {
  const actual = Number(item.stock_actual ?? 0);
  const min = Number(item.stock_minimo ?? 0);
  return actual < min ? ("destructive" as const) : ("secondary" as const);
}

function tipoLabel(tipo: string | null) {
  if (tipo === "entrada") return "Entrada";
  if (tipo === "salida") return "Salida";
  if (tipo === "ajuste") return "Ajuste";
  return tipo ?? "—";
}

function calcStockSerie(movs: MovimientoRow[]) {
  const sorted = [...movs].sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  let stock = 0;
  return sorted.map((m) => {
    const qty = Number(m.cantidad ?? 0);
    if (m.tipo === "entrada") stock += qty;
    else if (m.tipo === "salida") stock -= qty;
    else if (m.tipo === "ajuste") stock = qty;
    return { fecha: (m.fecha ?? "").slice(0, 10), stock };
  });
}

function BodegaPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"inventario" | "movimientos">("inventario");

  const [q, setQ] = useState("");
  const [soloBajoStock, setSoloBajoStock] = useState(false);
  const [proveedorFilter, setProveedorFilter] = useState("all");

  const [openItem, setOpenItem] = useState(false);
  const [openMov, setOpenMov] = useState(false);

  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores-min"],
    queryFn: async (): Promise<ProveedorMin[]> => {
      const { data, error } = await supabase.from("proveedores").select("id,nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias-costo"],
    queryFn: async (): Promise<CatMin[]> => {
      const { data, error } = await supabase
        .from("categorias_costo")
        .select("id,nombre")
        .eq("activa", true)
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subcategorias = [] } = useQuery({
    queryKey: ["subcategorias-costo"],
    queryFn: async (): Promise<SubcatMin[]> => {
      const { data, error } = await supabase
        .from("subcategorias_costo")
        .select("id,nombre,categoria_id, categorias_costo(nombre)")
        .eq("activa", true)
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: alertasCount = 0 } = useQuery({
    queryKey: ["bodega", "alertas-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bodega_items")
        .select("id,stock_actual,stock_minimo");
      if (error) throw error;
      return (data ?? []).filter(
        (row: any) => Number(row.stock_actual ?? 0) < Number(row.stock_minimo ?? 0),
      ).length;
    },
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["bodega", "items"],
    queryFn: async (): Promise<ItemRow[]> => {
      const { data, error } = await supabase
        .from("bodega_items")
        .select(
          "id,nombre,stock_actual,stock_minimo,unidad,precio_costo,ubicacion,proveedor_id,subcategoria_id, proveedores(nombre), subcategorias_costo(nombre, categorias_costo(nombre))",
        )
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as unknown as ItemRow[];
    },
  });

  const filteredItems = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((it) => {
      if (soloBajoStock) {
        const actual = Number(it.stock_actual ?? 0);
        const min = Number(it.stock_minimo ?? 0);
        if (actual >= min) return false;
      }
      if (proveedorFilter !== "all" && it.proveedor_id !== proveedorFilter) return false;
      if (!query) return true;
      const blob = [
        it.nombre,
        it.proveedores?.nombre,
        it.subcategorias_costo?.categorias_costo?.nombre,
        it.subcategorias_costo?.nombre,
        it.ubicacion,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(query);
    });
  }, [items, proveedorFilter, q, soloBajoStock]);

  const { data: movimientos = [], isLoading: loadingMovs } = useQuery({
    queryKey: ["bodega", "movimientos"],
    queryFn: async (): Promise<MovimientoRow[]> => {
      const { data, error } = await supabase
        .from("bodega_movimientos")
        .select(
          "id,item_id,orden_id,grua_id,tipo,cantidad,fecha,descripcion, bodega_items(nombre), ordenes_servicio(folio_interno), gruas(patente)",
        )
        .order("fecha", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MovimientoRow[];
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["bodega"] });
    queryClient.invalidateQueries({ queryKey: ["bodega", "items"] });
    queryClient.invalidateQueries({ queryKey: ["bodega", "movimientos"] });
    queryClient.invalidateQueries({ queryKey: ["bodega", "alertas-count"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Bodega</h1>
          <p className="text-sm text-muted-foreground">Inventario y movimientos de stock.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={openItem} onOpenChange={setOpenItem}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> Nuevo ítem
              </Button>
            </DialogTrigger>
            <NuevoItemDialog
              categorias={categorias}
              subcategorias={subcategorias}
              proveedores={proveedores}
              onClose={() => setOpenItem(false)}
              onSaved={invalidateAll}
            />
          </Dialog>
          <Dialog open={openMov} onOpenChange={setOpenMov}>
            <DialogTrigger asChild>
              <Button variant="outline">Registrar movimiento</Button>
            </DialogTrigger>
            <NuevoMovimientoDialog
              items={items}
              onClose={() => setOpenMov(false)}
              onSaved={invalidateAll}
            />
          </Dialog>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="inventario" className="gap-2">
            Inventario
            {alertasCount > 0 && (
              <Badge variant="destructive" className="h-5 px-2">
                {alertasCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="inventario" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar ítem, proveedor, categoría..."
                  className="pl-8"
                />
              </div>
              <div>
                <Label className="text-xs">Proveedor</Label>
                <Select value={proveedorFilter} onValueChange={setProveedorFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {proveedores.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant={soloBajoStock ? "default" : "outline"}
                  onClick={() => setSoloBajoStock((s) => !s)}
                  className="w-full"
                >
                  {soloBajoStock ? "Solo bajo stock" : "Ver bajo stock"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead className="text-right">Costo</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead className="text-right">Ver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingItems ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Sin ítems.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((it) => (
                      <ItemRowView
                        key={it.id}
                        item={it}
                        categorias={categorias}
                        subcategorias={subcategorias}
                        proveedores={proveedores}
                        onSaved={invalidateAll}
                        movimientos={movimientos.filter((m) => m.item_id === it.id)}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimientos" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Ítem</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Grúa</TableHead>
                    <TableHead>Orden</TableHead>
                    <TableHead>Descripción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingMovs ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  ) : movimientos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Sin movimientos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    movimientos.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{formatDate(m.fecha)}</TableCell>
                        <TableCell className="capitalize">{tipoLabel(m.tipo)}</TableCell>
                        <TableCell className="font-medium">{m.bodega_items?.nombre ?? "—"}</TableCell>
                        <TableCell className="text-right">{Number(m.cantidad ?? 0)}</TableCell>
                        <TableCell>{m.gruas?.patente ?? "—"}</TableCell>
                        <TableCell>{m.ordenes_servicio?.folio_interno ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{m.descripcion ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ItemRowView({
  item,
  categorias,
  subcategorias,
  proveedores,
  movimientos,
  onSaved,
}: {
  item: ItemRow;
  categorias: CatMin[];
  subcategorias: SubcatMin[];
  proveedores: ProveedorMin[];
  movimientos: MovimientoRow[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const catName = item.subcategorias_costo?.categorias_costo?.nombre ?? "—";
  const subName = item.subcategorias_costo?.nombre ?? "—";
  return (
    <TableRow>
      <TableCell className="font-medium">{item.nombre}</TableCell>
      <TableCell className="text-muted-foreground">
        {catName !== "—" ? `${catName} → ${subName}` : subName}
      </TableCell>
      <TableCell className="text-right">
        <Badge variant={stockVariant(item)}>{Number(item.stock_actual ?? 0)}</Badge>
      </TableCell>
      <TableCell className="text-right">{Number(item.stock_minimo ?? 0)}</TableCell>
      <TableCell>{item.unidad ?? "—"}</TableCell>
      <TableCell className="text-right">{formatCLP(Number(item.precio_costo ?? 0))}</TableCell>
      <TableCell>{item.proveedores?.nombre ?? "—"}</TableCell>
      <TableCell className="text-muted-foreground">{item.ubicacion ?? "—"}</TableCell>
      <TableCell className="text-right">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              Ver
            </Button>
          </DialogTrigger>
          <ItemDetailDialog
            item={item}
            categorias={categorias}
            subcategorias={subcategorias}
            proveedores={proveedores}
            movimientos={movimientos}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              onSaved();
            }}
          />
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function NuevoItemDialog({
  categorias,
  subcategorias,
  proveedores,
  onClose,
  onSaved,
}: {
  categorias: CatMin[];
  subcategorias: SubcatMin[];
  proveedores: ProveedorMin[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [categoriaId, setCategoriaId] = useState<string>("none");
  const [subcategoriaId, setSubcategoriaId] = useState<string>("none");
  const [proveedorId, setProveedorId] = useState<string>("none");
  const [stockMinimo, setStockMinimo] = useState("0");
  const [precioCosto, setPrecioCosto] = useState("0");
  const [unidad, setUnidad] = useState("unidad");
  const [ubicacion, setUbicacion] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setSubcategoriaId("none"), [categoriaId]);

  const subsFiltradas = subcategorias.filter(
    (s) => categoriaId === "none" || s.categoria_id === categoriaId,
  );

  const submit = async () => {
    const parsed = createItemSchema.safeParse({
      nombre,
      subcategoria_id: subcategoriaId !== "none" ? subcategoriaId : undefined,
      proveedor_id: proveedorId !== "none" ? proveedorId : undefined,
      stock_minimo: stockMinimo,
      precio_costo: precioCosto,
      unidad,
      ubicacion: ubicacion || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("bodega_items").insert({
        nombre: parsed.data.nombre,
        subcategoria_id: parsed.data.subcategoria_id ?? null,
        proveedor_id: parsed.data.proveedor_id ?? null,
        stock_minimo: Number(parsed.data.stock_minimo ?? 0),
        precio_costo: Number(parsed.data.precio_costo ?? 0),
        unidad: parsed.data.unidad ?? "unidad",
        ubicacion: parsed.data.ubicacion ?? null,
      });
      if (error) throw error;
      toast.success("Ítem creado");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Nuevo ítem</DialogTitle>
        <DialogDescription>
          El stock actual parte en 0 y se actualiza solo con movimientos.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label>Nombre *</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <Label>Categoría</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin categoría</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subcategoría</Label>
          <Select value={subcategoriaId} onValueChange={setSubcategoriaId} disabled={subsFiltradas.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin subcategoría</SelectItem>
              {subsFiltradas.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Proveedor</Label>
          <Select value={proveedorId} onValueChange={setProveedorId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin proveedor</SelectItem>
              {proveedores.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Stock mínimo</Label>
          <Input type="number" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
        </div>
        <div>
          <Label>Precio costo</Label>
          <Input type="number" value={precioCosto} onChange={(e) => setPrecioCosto(e.target.value)} />
        </div>
        <div>
          <Label>Unidad</Label>
          <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="unidad" />
        </div>
        <div>
          <Label>Ubicación</Label>
          <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Rack / bodega..." />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? "Guardando..." : "Crear ítem"}
        </Button>
      </div>
    </DialogContent>
  );
}

function ItemDetailDialog({
  item,
  categorias,
  subcategorias,
  proveedores,
  movimientos,
  onClose,
  onSaved,
}: {
  item: ItemRow;
  categorias: CatMin[];
  subcategorias: SubcatMin[];
  proveedores: ProveedorMin[];
  movimientos: MovimientoRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [nombre, setNombre] = useState(item.nombre);
  const [categoriaId, setCategoriaId] = useState<string>("none");
  const [subcategoriaId, setSubcategoriaId] = useState<string>(item.subcategoria_id ?? "none");
  const [proveedorId, setProveedorId] = useState<string>(item.proveedor_id ?? "none");
  const [stockMinimo, setStockMinimo] = useState(String(Number(item.stock_minimo ?? 0)));
  const [precioCosto, setPrecioCosto] = useState(String(Number(item.precio_costo ?? 0)));
  const [unidad, setUnidad] = useState(item.unidad ?? "unidad");
  const [ubicacion, setUbicacion] = useState(item.ubicacion ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sc = subcategorias.find((s) => s.id === item.subcategoria_id);
    setCategoriaId(sc?.categoria_id ?? "none");
  }, [item.subcategoria_id, subcategorias]);

  useEffect(() => {
    if (categoriaId === "none") return;
    const sc = subcategorias.find((s) => s.id === subcategoriaId);
    if (sc && sc.categoria_id !== categoriaId) setSubcategoriaId("none");
  }, [categoriaId, subcategoriaId, subcategorias]);

  const subsFiltradas = subcategorias.filter(
    (s) => categoriaId === "none" || s.categoria_id === categoriaId,
  );

  const serie = useMemo(() => calcStockSerie(movimientos), [movimientos]);

  const save = async () => {
    const parsed = createItemSchema.safeParse({
      nombre,
      subcategoria_id: subcategoriaId !== "none" ? subcategoriaId : undefined,
      proveedor_id: proveedorId !== "none" ? proveedorId : undefined,
      stock_minimo: stockMinimo,
      precio_costo: precioCosto,
      unidad,
      ubicacion: ubicacion || undefined,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("bodega_items")
        .update({
          nombre: parsed.data.nombre,
          subcategoria_id: parsed.data.subcategoria_id ?? null,
          proveedor_id: parsed.data.proveedor_id ?? null,
          stock_minimo: Number(parsed.data.stock_minimo ?? 0),
          precio_costo: Number(parsed.data.precio_costo ?? 0),
          unidad: parsed.data.unidad ?? "unidad",
          ubicacion: parsed.data.ubicacion ?? null,
        })
        .eq("id", item.id);
      if (error) throw error;
      toast.success("Ítem actualizado");
      queryClient.invalidateQueries({ queryKey: ["bodega", "items"] });
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{item.nombre}</DialogTitle>
        <DialogDescription>Stock actual: {Number(item.stock_actual ?? 0)} {item.unidad ?? ""}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label>Nombre *</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <Label>Categoría</Label>
          <Select value={categoriaId} onValueChange={setCategoriaId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin categoría</SelectItem>
              {categorias.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Subcategoría</Label>
          <Select value={subcategoriaId} onValueChange={setSubcategoriaId} disabled={subsFiltradas.length === 0}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin subcategoría</SelectItem>
              {subsFiltradas.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Proveedor</Label>
          <Select value={proveedorId} onValueChange={setProveedorId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin proveedor</SelectItem>
              {proveedores.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Stock mínimo</Label>
          <Input type="number" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value)} />
        </div>
        <div>
          <Label>Precio costo</Label>
          <Input type="number" value={precioCosto} onChange={(e) => setPrecioCosto(e.target.value)} />
        </div>
        <div>
          <Label>Unidad</Label>
          <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} />
        </div>
        <div>
          <Label>Ubicación</Label>
          <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-3">
        <Button variant="outline" onClick={onClose}>
          Cerrar
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </Button>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Movimientos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead>Descripción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                    Sin movimientos.
                  </TableCell>
                </TableRow>
              ) : (
                [...movimientos]
                  .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
                  .slice(0, 30)
                  .map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{formatDate(m.fecha)}</TableCell>
                      <TableCell className="capitalize">{tipoLabel(m.tipo)}</TableCell>
                      <TableCell className="text-right">{Number(m.cantidad ?? 0)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.descripcion ?? "—"}</TableCell>
                    </TableRow>
                  ))
              )}
            </TableBody>
          </Table>
          {serie.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-muted-foreground">
                Stock calculado desde movimientos (entrada/salida/ajuste).
              </div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha" />
                    <YAxis />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="stock"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </DialogContent>
  );
}

function NuevoMovimientoDialog({
  items,
  onClose,
  onSaved,
}: {
  items: ItemRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [itemSearch, setItemSearch] = useState("");
  const [itemId, setItemId] = useState("none");
  const [tipo, setTipo] = useState<"entrada" | "salida" | "ajuste">("entrada");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState(today());
  const [gruaId, setGruaId] = useState("none");
  const [ordenSearch, setOrdenSearch] = useState("");
  const [ordenId, setOrdenId] = useState("none");
  const [descripcion, setDescripcion] = useState("");

  const { data: gruas = [] } = useQuery({
    queryKey: ["gruas-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("gruas").select("id,patente").order("patente");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ordenes = [], isLoading: loadingOrdenes } = useQuery({
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

  const filtered = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    return items
      .filter((it) => it.nombre.toLowerCase().includes(q))
      .slice(0, 50);
  }, [items, itemSearch]);

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = createMovimientoSchema.safeParse({
        item_id: itemId !== "none" ? itemId : "",
        tipo,
        cantidad,
        fecha,
        grua_id: gruaId !== "none" ? gruaId : undefined,
        orden_id: ordenId !== "none" ? ordenId : undefined,
        descripcion: descripcion || undefined,
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? "Revisa los campos");
      }

      if (parsed.data.tipo === "salida") {
        const { data: it, error } = await supabase
          .from("bodega_items")
          .select("stock_actual,unidad")
          .eq("id", parsed.data.item_id)
          .single();
        if (error) throw error;
        const disponible = Number((it as any).stock_actual ?? 0);
        if (Number(parsed.data.cantidad) > disponible) {
          throw new Error(`Stock insuficiente. Disponible: ${disponible} ${(it as any).unidad ?? ""}`.trim());
        }
      }

      const { error } = await supabase.from("bodega_movimientos").insert({
        item_id: parsed.data.item_id,
        tipo: parsed.data.tipo,
        cantidad: Number(parsed.data.cantidad),
        fecha: parsed.data.fecha,
        grua_id: parsed.data.grua_id ?? null,
        orden_id: parsed.data.orden_id ?? null,
        descripcion: parsed.data.descripcion ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimiento registrado");
      queryClient.invalidateQueries({ queryKey: ["bodega"] });
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Registrar movimiento</DialogTitle>
        <DialogDescription>
          El stock se actualiza automáticamente al registrar movimientos.
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <Label>Buscar ítem</Label>
          <Input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="Nombre..." />
        </div>
        <div className="md:col-span-2">
          <Label>Ítem *</Label>
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Selecciona...</SelectItem>
              {filtered.map((it) => (
                <SelectItem key={it.id} value={it.id}>
                  {it.nombre} ({Number(it.stock_actual ?? 0)} {it.unidad ?? ""})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo *</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="entrada">Entrada</SelectItem>
              <SelectItem value="salida">Salida</SelectItem>
              <SelectItem value="ajuste">Ajuste (valor absoluto)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cantidad *</Label>
          <Input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
        </div>
        <div>
          <Label>Fecha *</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div>
          <Label>Grúa asociada</Label>
          <Select value={gruaId} onValueChange={setGruaId}>
            <SelectTrigger>
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Ninguna</SelectItem>
              {(gruas as any[]).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.patente}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Buscar orden</Label>
            <Input
              value={ordenSearch}
              onChange={(e) => setOrdenSearch(e.target.value)}
              placeholder="Folio interno o folio cliente…"
            />
          </div>
          <div>
            <Label>Orden asociada</Label>
            <Select
              value={ordenId}
              onValueChange={setOrdenId}
              disabled={ordenSearch.trim().length < 2}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    ordenSearch.trim().length < 2
                      ? "Escribe al menos 2 caracteres"
                      : loadingOrdenes
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
        </div>
        <div className="md:col-span-2">
          <Label>Descripción</Label>
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
          {submit.isPending ? "Guardando..." : "Registrar"}
        </Button>
      </div>
    </DialogContent>
  );
}

export const Route = createFileRoute("/_app/bodega")({
  component: BodegaPage,
});
