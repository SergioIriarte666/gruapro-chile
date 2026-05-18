import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCLP, formatDateTime } from "@/lib/format";
import {
  vehiculoClienteSchema,
  type VehiculoClienteFormValues,
} from "@/lib/clientes-schema";
import type { Tables } from "@/integrations/supabase/types";

type Cliente = Tables<"clientes">;
type VehiculoCatalogo = Tables<"vehiculos_catalogo">;
type ClienteVehiculo = Tables<"clientes_vehiculos"> & {
  vehiculos_catalogo: VehiculoCatalogo | null;
};
type OrdenServicio = Tables<"ordenes_servicio">;
type Cierre = Tables<"cierres">;

function ClienteDetailPage() {
  const { clienteId } = Route.useParams();

  const { data: cliente, isLoading } = useQuery({
    queryKey: ["clientes", clienteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("*")
        .eq("id", clienteId)
        .single();
      if (error) throw error;
      return data as Cliente;
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Cargando cliente...</div>;
  }
  if (!cliente) {
    return <div className="text-muted-foreground">Cliente no encontrado.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/clientes">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">{cliente.nombre}</h1>
          <p className="text-sm text-muted-foreground">{cliente.rut ?? "Sin RUT"}</p>
        </div>
        <Badge variant="secondary" className="capitalize ml-2">
          {cliente.tipo ?? "—"}
        </Badge>
      </div>

      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="vehiculos">Vehículos</TabsTrigger>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="saldo">Saldo</TabsTrigger>
        </TabsList>

        <TabsContent value="datos">
          <DatosTab cliente={cliente} />
        </TabsContent>
        <TabsContent value="vehiculos">
          <VehiculosTab clienteId={clienteId} />
        </TabsContent>
        <TabsContent value="servicios">
          <ServiciosTab clienteId={clienteId} />
        </TabsContent>
        <TabsContent value="saldo">
          <SaldoTab clienteId={clienteId} />
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

function DatosTab({ cliente }: { cliente: Cliente }) {
  return (
    <Card>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6">
        <Field label="Nombre" value={cliente.nombre} />
        <Field label="RUT" value={cliente.rut} />
        <Field label="Tipo" value={<span className="capitalize">{cliente.tipo}</span>} />
        <Field label="Email" value={cliente.email} />
        <Field label="Teléfono" value={cliente.telefono} />
        <Field label="Dirección" value={cliente.direccion} />
        <Field label="Condición de pago" value={`${cliente.condicion_pago ?? 0} días`} />
        <Field label="Período de cierre" value={<span className="capitalize">{cliente.periodo_cierre}</span>} />
        <Field label="Requiere folio" value={cliente.requiere_folio ? "Sí" : "No"} />
        <Field label="IVA incluido" value={cliente.iva_incluido ? "Sí" : "No"} />
        <div className="md:col-span-2">
          <Field label="Observaciones" value={cliente.observaciones} />
        </div>
      </CardContent>
    </Card>
  );
}

function VehiculosTab({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: vehiculos = [], isLoading } = useQuery({
    queryKey: ["clientes", clienteId, "vehiculos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes_vehiculos")
        .select("*, vehiculos_catalogo(*)")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      return (data ?? []) as ClienteVehiculo[];
    },
  });

  const { data: catalogo = [] } = useQuery({
    queryKey: ["vehiculos_catalogo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehiculos_catalogo")
        .select("*")
        .eq("estado", "activo")
        .order("marca");
      if (error) throw error;
      return (data ?? []) as VehiculoCatalogo[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: VehiculoClienteFormValues) => {
      const { error } = await supabase.from("clientes_vehiculos").insert({
        cliente_id: clienteId,
        vehiculo_catalogo_id: values.vehiculo_catalogo_id,
        patente: values.patente,
        color: values.color || null,
        observaciones: values.observaciones || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vehículo agregado");
      setOpen(false);
      queryClient.invalidateQueries({
        queryKey: ["clientes", clienteId, "vehiculos"],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Vehículos</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Agregar vehículo
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patente</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Año</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Observaciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : vehiculos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Sin vehículos registrados.
                </TableCell>
              </TableRow>
            ) : (
              vehiculos.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium uppercase">{v.patente ?? "—"}</TableCell>
                  <TableCell>{v.vehiculos_catalogo?.marca ?? "—"}</TableCell>
                  <TableCell>{v.vehiculos_catalogo?.modelo ?? "—"}</TableCell>
                  <TableCell>{v.vehiculos_catalogo?.anio ?? "—"}</TableCell>
                  <TableCell>{v.color ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.observaciones ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar vehículo</DialogTitle>
            <DialogDescription>
              Selecciona desde el catálogo y completa la patente.
            </DialogDescription>
          </DialogHeader>
          <AddVehiculoForm
            catalogo={catalogo}
            onCancel={() => setOpen(false)}
            onSubmit={(v) => createMutation.mutateAsync(v)}
            isSubmitting={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AddVehiculoForm({
  catalogo,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  catalogo: VehiculoCatalogo[];
  onSubmit: (v: VehiculoClienteFormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const form = useForm<VehiculoClienteFormValues>({
    resolver: zodResolver(vehiculoClienteSchema),
    defaultValues: {
      vehiculo_catalogo_id: "",
      patente: "",
      color: "",
      observaciones: "",
    },
  });

  const [marca, setMarca] = useState<string>("");
  const [modelo, setModelo] = useState<string>("");

  const marcas = useMemo(
    () => Array.from(new Set(catalogo.map((c) => c.marca))).sort(),
    [catalogo],
  );
  const modelos = useMemo(
    () =>
      Array.from(
        new Set(catalogo.filter((c) => c.marca === marca).map((c) => c.modelo)),
      ).sort(),
    [catalogo, marca],
  );
  const anios = useMemo(
    () =>
      catalogo
        .filter((c) => c.marca === marca && c.modelo === modelo)
        .sort((a, b) => (b.anio ?? 0) - (a.anio ?? 0)),
    [catalogo, marca, modelo],
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <FormItem>
          <FormLabel>Marca</FormLabel>
          <Select
            value={marca}
            onValueChange={(v) => {
              setMarca(v);
              setModelo("");
              form.setValue("vehiculo_catalogo_id", "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona marca" />
            </SelectTrigger>
            <SelectContent>
              {marcas.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>

        <FormItem>
          <FormLabel>Modelo</FormLabel>
          <Select
            value={modelo}
            onValueChange={(v) => {
              setModelo(v);
              form.setValue("vehiculo_catalogo_id", "");
            }}
            disabled={!marca}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecciona modelo" />
            </SelectTrigger>
            <SelectContent>
              {modelos.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>

        <FormField
          control={form.control}
          name="vehiculo_catalogo_id"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Año</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={!modelo}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona año" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {anios.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.anio ?? "Sin año"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="patente"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Patente *</FormLabel>
              <FormControl>
                <Input
                  className="uppercase"
                  placeholder="ABCD12"
                  {...field}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Color</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="observaciones"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Observaciones</FormLabel>
              <FormControl>
                <Textarea rows={2} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="md:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : "Agregar"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function estadoVariant(
  estado: string | null,
): "default" | "secondary" | "outline" | "destructive" {
  switch (estado) {
    case "completado":
    case "facturado":
    case "pagado":
      return "default";
    case "cancelado":
      return "destructive";
    case "en_curso":
      return "secondary";
    default:
      return "outline";
  }
}

function ServiciosTab({ clienteId }: { clienteId: string }) {
  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ["clientes", clienteId, "ordenes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("*")
        .eq("cliente_id", clienteId)
        .order("fecha_servicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrdenServicio[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de servicios</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origen → Destino</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : ordenes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Sin servicios registrados.
                </TableCell>
              </TableRow>
            ) : (
              ordenes.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.folio_interno ?? "—"}</TableCell>
                  <TableCell>{formatDateTime(o.fecha_servicio)}</TableCell>
                  <TableCell className="capitalize">{o.tipo_servicio ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {(o.origen ?? "—") + " → " + (o.destino ?? "—")}
                  </TableCell>
                  <TableCell className="text-right">{formatCLP(o.monto)}</TableCell>
                  <TableCell>
                    <Badge variant={estadoVariant(o.estado)} className="capitalize">
                      {o.estado ?? "—"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SaldoTab({ clienteId }: { clienteId: string }) {
  const { data: cierres = [], isLoading } = useQuery({
    queryKey: ["clientes", clienteId, "saldo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("*")
        .eq("cliente_id", clienteId)
        .in("estado", ["enviado", "con_folio"]);
      if (error) throw error;
      return (data ?? []) as Cierre[];
    },
  });

  const total = cierres.reduce((acc, c) => acc + Number(c.total ?? 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Saldo pendiente de cobro</CardTitle>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            Total pendiente
          </div>
          <div className="text-2xl font-bold text-destructive">
            {formatCLP(total)}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cierre</TableHead>
              <TableHead>Período</TableHead>
              <TableHead>Folio cliente</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : cierres.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  Sin saldo pendiente.
                </TableCell>
              </TableRow>
            ) : (
              cierres.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.numero ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.periodo_inicio} → {c.periodo_fin}
                  </TableCell>
                  <TableCell>{c.folio_cliente ?? "—"}</TableCell>
                  <TableCell>{c.folio_vencimiento ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCLP(c.total)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {c.estado ?? "—"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export const Route = createFileRoute("/_app/clientes/$clienteId")({
  component: ClienteDetailPage,
});
