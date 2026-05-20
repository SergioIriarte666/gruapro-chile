import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useServerFn as useTanstackServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChangeHistoryPanel } from "@/components/shared/change-history-panel";
import { formatCLP, formatDate, formatDateTime } from "@/lib/format";
import { estadoOrdenVariant } from "@/lib/ordenes-options";
import {
  anularOrden,
  cambiarEstadoOrden,
  completarOrden,
} from "@/lib/ordenes.functions";
import { createCostoSchema } from "@/lib/validations/costos";

function OrdenDetailPage() {
  const { ordenId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: orden, isLoading } = useQuery({
    queryKey: ["ordenes", ordenId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select(
          `*, clientes(nombre,rut), gruas(patente,marca,modelo),
           operadores(id,nombre),
           clientes_vehiculos(patente,color, vehiculos_catalogo(marca,modelo,anio))`,
        )
        .eq("id", ordenId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const completarFn = useTanstackServerFn(completarOrden);
  const anularFn = useTanstackServerFn(anularOrden);
  const cambiarFn = useTanstackServerFn(cambiarEstadoOrden);

  const completarMut = useMutation({
    mutationFn: () => completarFn({ data: { ordenId } }),
    onSuccess: (res) => {
      toast.success(
        res?.comisionCreada
          ? `Orden completada. Comisión generada: ${formatCLP(res.monto)}`
          : "Orden completada",
      );
      queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes", ordenId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anularMut = useMutation({
    mutationFn: () => anularFn({ data: { ordenId } }),
    onSuccess: () => {
      toast.success("Orden anulada");
      queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes", ordenId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cambiarMut = useMutation({
    mutationFn: () => cambiarFn({ data: { ordenId, estado: "en_curso" } }),
    onSuccess: () => {
      toast.success("Servicio iniciado");
      queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes", ordenId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Cargando orden...</div>;
  }
  if (!orden) {
    return <div className="text-muted-foreground">Orden no encontrada.</div>;
  }

  const canIniciar = orden.estado === "pendiente";
  const canCompletar = orden.estado === "en_curso";
  const canAnular = orden.estado !== "anulado" && orden.estado !== "facturado";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button asChild variant="ghost" size="icon">
          <Link to="/ordenes">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{orden.folio_interno ?? "Sin folio"}</h1>
          <p className="text-sm text-muted-foreground">
            {orden.clientes?.nombre} · {formatDateTime(orden.fecha_servicio)}
          </p>
        </div>
        <Badge variant={estadoOrdenVariant(orden.estado)} className="capitalize">
          {orden.estado ?? "—"}
        </Badge>

        {(canIniciar || canCompletar || canAnular) && (
          <div className="flex gap-2">
            {canIniciar && (
              <Button onClick={() => cambiarMut.mutate()} disabled={cambiarMut.isPending}>
                {cambiarMut.isPending && <Loader2 className="animate-spin" />}
                Iniciar servicio
              </Button>
            )}
            {canCompletar && (
              <Button onClick={() => completarMut.mutate()} disabled={completarMut.isPending}>
                {completarMut.isPending && <Loader2 className="animate-spin" />}
                Completar servicio
              </Button>
            )}
            {canAnular && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={anularMut.isPending}>
                    {anularMut.isPending && <Loader2 className="animate-spin" />}
                    Anular
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Anular orden?</AlertDialogTitle>
                    <AlertDialogDescription>
                      No se puede anular si está incluida en un cierre activo. Si tiene comisión
                      pendiente, el trigger la elimina automáticamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => anularMut.mutate()}>
                      Anular
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos del servicio</TabsTrigger>
          <TabsTrigger value="costos">Costos asociados</TabsTrigger>
          <TabsTrigger value="comision">Comisión</TabsTrigger>
          <TabsTrigger value="cierre">Cierre</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <DatosTab orden={orden} />
          <div className="mt-4">
            <FotosTab ordenId={ordenId} fotos={(orden.fotos as string[] | null) ?? []} />
          </div>
        </TabsContent>
        <TabsContent value="costos">
          <CostosTab
            ordenId={ordenId}
            montoServicio={Number((orden as any).monto ?? 0)}
            gruaId={(orden as any).grua_id ?? null}
          />
        </TabsContent>
        <TabsContent value="comision">
          <ComisionTab ordenId={ordenId} />
        </TabsContent>
        <TabsContent value="cierre">
          <CierreTab ordenId={ordenId} />
        </TabsContent>
        <TabsContent value="historial">
          <ChangeHistoryPanel entityType="orden" entityId={ordenId} />
        </TabsContent>
      </Tabs>
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

function DatosTab({ orden }: { orden: any }) {
  const cv = orden.clientes_vehiculos;
  const cat = cv?.vehiculos_catalogo;
  return (
    <Card>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
        <Field label="Folio interno" value={orden.folio_interno} />
        <Field label="Folio cliente" value={orden.folio_cliente} />
        <Field label="Folio siniestro" value={orden.folio_siniestro} />

        <Field label="Cliente" value={orden.clientes?.nombre} />
        <Field
          label="Vehículo"
          value={cv ? `${cat?.marca ?? ""} ${cat?.modelo ?? ""} ${cat?.anio ?? ""} · ${cv.patente ?? "—"}` : "—"}
        />
        <Field label="Color" value={cv?.color} />

        <Field label="Tipo de servicio" value={<span className="capitalize">{orden.tipo_servicio}</span>} />
        <Field label="Fecha del servicio" value={formatDateTime(orden.fecha_servicio)} />
        <Field label="Forma de pago" value={<span className="capitalize">{orden.forma_pago}</span>} />

        <Field label="Origen" value={orden.origen} />
        <Field label="Destino" value={orden.destino} />
        <Field label="Monto" value={formatCLP(orden.monto)} />

        <Field label="Grúa" value={orden.gruas ? `${orden.gruas.patente} (${orden.gruas.marca ?? ""} ${orden.gruas.modelo ?? ""})` : "—"} />
        <Field label="Operador" value={orden.operadores?.nombre} />
        <Field label="Creada" value={formatDateTime(orden.created_at)} />

        <div className="md:col-span-3">
          <Field label="Observaciones" value={orden.observaciones} />
        </div>
      </CardContent>
    </Card>
  );
}

function FotosTab({ ordenId, fotos }: { ordenId: string; fotos: string[] }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${ordenId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("fotos-servicios")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("fotos-servicios").getPublicUrl(path);
        urls.push(data.publicUrl);
      }
      const nuevas = [...fotos, ...urls];
      const { error: updErr } = await supabase
        .from("ordenes_servicio")
        .update({ fotos: nuevas })
        .eq("id", ordenId);
      if (updErr) throw updErr;
      toast.success(`${urls.length} foto(s) subida(s)`);
      queryClient.invalidateQueries({ queryKey: ["ordenes", ordenId] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Fotos del servicio</CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
            Subir fotos
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {fotos.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            Sin fotos subidas.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {fotos.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square rounded-md overflow-hidden border bg-muted hover:opacity-80 transition"
              >
                <img src={url} alt="Foto servicio" className="w-full h-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CostosTab({
  ordenId,
  montoServicio,
  gruaId,
}: {
  ordenId: string;
  montoServicio: number;
  gruaId: string | null;
}) {
  const queryClient = useQueryClient();
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [monto, setMonto] = useState("");
  const [medio, setMedio] = useState("transferencia");
  const [numDoc, setNumDoc] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias-costo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categorias_costo")
        .select("*")
        .eq("activa", true)
        .order("nombre");
      if (error) throw error;
      return data ?? [];
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
      return data ?? [];
    },
  });

  const subsFiltradas = subcategorias.filter(
    (s: any) =>
      s.categoria_id === categoriaId && (!s.aplica_a || s.aplica_a === "ambos" || s.aplica_a === "servicio"),
  );

  const { data: costos = [], isLoading } = useQuery({
    queryKey: ["ordenes", ordenId, "costos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos")
        .select(
          "id,fecha,monto,medio_pago,numero_documento,descripcion, categorias_costo(nombre), subcategorias_costo(nombre)",
        )
        .eq("orden_id", ordenId)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = costos.reduce((acc: number, c: any) => acc + Number(c.monto ?? 0), 0);
  const margen = Number(montoServicio ?? 0) - total;

  const addCosto = useMutation({
    mutationFn: async () => {
      const result = createCostoSchema.safeParse({
        fecha,
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        monto,
        medio_pago: (medio || undefined) as any,
        tipo: "servicio",
        orden_id: ordenId,
        grua_id: gruaId ?? undefined,
        numero_documento: numDoc || undefined,
        descripcion: descripcion || undefined,
      });
      if (!result.success) {
        throw new Error(result.error.issues[0]?.message ?? "Revisa los campos obligatorios");
      }
      const parsed = result.data;

      const { error } = await supabase.from("costos").insert({
        fecha: parsed.fecha,
        tipo: "servicio",
        orden_id: ordenId,
        grua_id: parsed.grua_id ?? null,
        categoria_id: parsed.categoria_id,
        subcategoria_id: parsed.subcategoria_id,
        monto: Number(parsed.monto),
        medio_pago: parsed.medio_pago ?? null,
        numero_documento: parsed.numero_documento ?? null,
        descripcion: parsed.descripcion ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Costo agregado");
      setCategoriaId("");
      setSubcategoriaId("");
      setMonto("");
      setNumDoc("");
      setDescripcion("");
      queryClient.invalidateQueries({ queryKey: ["ordenes", ordenId, "costos"] });
      queryClient.invalidateQueries({ queryKey: ["ordenes", ordenId] });
      queryClient.invalidateQueries({ queryKey: ["costos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Costos directos</CardTitle>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase">Servicio</div>
              <div className="font-semibold">{formatCLP(montoServicio)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase">Costos</div>
              <div className="font-semibold text-destructive">{formatCLP(total)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground uppercase">Margen</div>
              <div className={`font-semibold ${margen >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                {formatCLP(margen)}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-1">
            <Label className="text-xs">Fecha *</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Categoría *</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona…" />
              </SelectTrigger>
              <SelectContent>
                {categorias
                  .filter((c: any) => !c.tipo || c.tipo === "servicio" || c.tipo === "ambos")
                  .map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Subcategoría *</Label>
            <Select
              value={subcategoriaId}
              onValueChange={setSubcategoriaId}
              disabled={!categoriaId || subsFiltradas.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={categoriaId ? "Selecciona…" : "Elige categoría primero"} />
              </SelectTrigger>
              <SelectContent>
                {subsFiltradas.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-1">
            <Label className="text-xs">Monto *</Label>
            <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" />
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">Medio de pago</Label>
            <Select value={medio} onValueChange={setMedio}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="tarjeta">Tarjeta</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-xs">N° documento</Label>
            <Input value={numDoc} onChange={(e) => setNumDoc(e.target.value)} placeholder="Boleta/factura" />
          </div>
          <div className="md:col-span-6">
            <Label className="text-xs">Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} />
          </div>
          <div className="md:col-span-6 flex justify-end">
            <Button onClick={() => addCosto.mutate()} disabled={addCosto.isPending}>
              {addCosto.isPending && <Loader2 className="animate-spin" />}
              Agregar costo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Costos registrados</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Doc.</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : costos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    Sin costos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                costos.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell>{formatDate(c.fecha)}</TableCell>
                    <TableCell>
                      {(c.categorias_costo?.nombre ?? "—") +
                        (c.subcategorias_costo?.nombre
                          ? ` → ${c.subcategorias_costo.nombre}`
                          : "")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.descripcion ?? "—"}</TableCell>
                    <TableCell>{c.numero_documento ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCLP(c.monto)}</TableCell>
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

function ComisionTab({ ordenId }: { ordenId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["ordenes", ordenId, "comision"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comisiones")
        .select("*, operadores(nombre)")
        .eq("orden_id", ordenId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>;
  if (!data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Aún no se ha generado comisión. Se creará automáticamente al marcar la orden como completada.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle>Comisión del operador</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Operador" value={(data as any).operadores?.nombre} />
        <Field label="Monto" value={formatCLP(data.monto_comision)} />
        <Field label="Estado" value={<Badge variant={data.estado === "pagado" ? "default" : "outline"} className="capitalize">{data.estado ?? "—"}</Badge>} />
        <Field label="Fecha pago" value={formatDate(data.fecha_pago)} />
        <Field label="Creada" value={formatDateTime(data.created_at)} />
      </CardContent>
    </Card>
  );
}

function CierreTab({ ordenId }: { ordenId: string }) {
  const { data: cierre, isLoading } = useQuery({
    queryKey: ["ordenes", ordenId, "cierre"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierre_servicios")
        .select("*, cierres(*)")
        .eq("orden_id", ordenId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <Card><CardContent className="py-8 text-center text-muted-foreground">Cargando...</CardContent></Card>;
  if (!cierre) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Esta orden aún no ha sido incluida en un cierre.
        </CardContent>
      </Card>
    );
  }
  const c = (cierre as any).cierres;
  return (
    <Card>
      <CardHeader><CardTitle>Cierre asociado</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Número" value={c?.numero} />
        <Field label="Estado" value={<span className="capitalize">{c?.estado}</span>} />
        <Field label="Período" value={`${c?.periodo_inicio ?? "—"} → ${c?.periodo_fin ?? "—"}`} />
        <Field label="Monto aplicado" value={formatCLP(cierre.monto_aplicado)} />
        <Field label="Total cierre" value={formatCLP(c?.total)} />
        <Field label="Folio cliente" value={c?.folio_cliente} />
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_app/ordenes/$ordenId")({
  component: OrdenDetailPage,
});
