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
import { formatCLP, formatDate, formatDateTime } from "@/lib/format";
import { estadoOrdenVariant } from "@/lib/ordenes-options";
import {
  anularOrden,
  cambiarEstadoOrden,
  completarOrden,
} from "@/lib/ordenes.functions";

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
    mutationFn: (estado: "pendiente" | "asignado" | "en_curso") =>
      cambiarFn({ data: { ordenId, estado } }),
    onSuccess: () => {
      toast.success("Estado actualizado");
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

  const isFinal = orden.estado === "completado" || orden.estado === "anulado";

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

        {!isFinal && (
          <div className="flex gap-2">
            <Select
              value=""
              onValueChange={(v) =>
                cambiarMut.mutate(v as "pendiente" | "asignado" | "en_curso")
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Cambiar estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pendiente">Pendiente</SelectItem>
                <SelectItem value="asignado">Asignado</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={() => completarMut.mutate()}
              disabled={completarMut.isPending}
            >
              {completarMut.isPending && <Loader2 className="animate-spin" />}
              Marcar completada
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">Anular</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Anular orden?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminará la comisión pendiente asociada (si existe).
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
          </div>
        )}
      </div>

      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos del servicio</TabsTrigger>
          <TabsTrigger value="costos">Costos asociados</TabsTrigger>
          <TabsTrigger value="comision">Comisión</TabsTrigger>
          <TabsTrigger value="cierre">Cierre</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <DatosTab orden={orden} />
          <div className="mt-4">
            <FotosTab ordenId={ordenId} fotos={(orden.fotos as string[] | null) ?? []} />
          </div>
        </TabsContent>
        <TabsContent value="costos">
          <CostosTab ordenId={ordenId} />
        </TabsContent>
        <TabsContent value="comision">
          <ComisionTab ordenId={ordenId} />
        </TabsContent>
        <TabsContent value="cierre">
          <CierreTab ordenId={ordenId} />
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

function CostosTab({ ordenId }: { ordenId: string }) {
  const { data: costos = [], isLoading } = useQuery({
    queryKey: ["ordenes", ordenId, "costos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos")
        .select("*")
        .eq("orden_id", ordenId)
        .order("fecha", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const total = costos.reduce((acc, c) => acc + Number(c.monto ?? 0), 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Costos asociados</CardTitle>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase">Total</div>
          <div className="text-lg font-semibold">{formatCLP(total)}</div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : costos.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin costos registrados.</TableCell></TableRow>
            ) : costos.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{formatDate(c.fecha)}</TableCell>
                <TableCell className="capitalize">{c.tipo ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{c.descripcion ?? "—"}</TableCell>
                <TableCell>{c.numero_documento ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCLP(c.monto)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
