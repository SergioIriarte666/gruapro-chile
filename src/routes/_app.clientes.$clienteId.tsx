import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NuevaOrdenWizard } from "@/components/ordenes/nueva-orden-wizard";
import { ChangeHistoryPanel } from "@/components/shared/change-history-panel";
import { VehiculoSelector } from "@/components/shared/vehiculo-selector";
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
import { formatCLP, formatDateTime } from "@/lib/format";
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openNuevaOrden, setOpenNuevaOrden] = useState(false);

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

  const { data: resumen } = useQuery({
    queryKey: ["clientes", clienteId, "resumen"],
    queryFn: async () => {
      const [
        serviciosTotal,
        serviciosEnCurso,
        vehiculosTotal,
        cierresPendientes,
        ultimoServicio,
      ] = await Promise.all([
        supabase
          .from("ordenes_servicio")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId),
        supabase
          .from("ordenes_servicio")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId)
          .in("estado", ["pendiente", "asignado", "en_curso"]),
        supabase
          .from("clientes_vehiculos")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", clienteId),
        supabase
          .from("cierres")
          .select("total, estado")
          .eq("cliente_id", clienteId)
          .in("estado", ["enviado", "con_folio"]),
        supabase
          .from("ordenes_servicio")
          .select("fecha_servicio")
          .eq("cliente_id", clienteId)
          .order("fecha_servicio", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (serviciosTotal.error) throw serviciosTotal.error;
      if (serviciosEnCurso.error) throw serviciosEnCurso.error;
      if (vehiculosTotal.error) throw vehiculosTotal.error;
      if (cierresPendientes.error) throw cierresPendientes.error;
      if (ultimoServicio.error) throw ultimoServicio.error;

      const saldo = (cierresPendientes.data ?? []).reduce(
        (acc, c) => acc + Number((c as any).total ?? 0),
        0,
      );

      return {
        serviciosTotal: serviciosTotal.count ?? 0,
        serviciosEnCurso: serviciosEnCurso.count ?? 0,
        vehiculosTotal: vehiculosTotal.count ?? 0,
        cierresPendientesTotal: (cierresPendientes.data ?? []).length,
        saldoPendiente: saldo,
        ultimoServicio: (ultimoServicio.data as any)?.fecha_servicio ?? null,
      };
    },
  });

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["clientes", clienteId] });
      queryClient.invalidateQueries({
        queryKey: ["clientes", clienteId, "vehiculos"],
      });
      queryClient.invalidateQueries({
        queryKey: ["clientes", clienteId, "ordenes"],
      });
      queryClient.invalidateQueries({
        queryKey: ["clientes", clienteId, "saldo"],
      });
      queryClient.invalidateQueries({
        queryKey: ["clientes", clienteId, "resumen"],
      });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      queryClient.invalidateQueries({ queryKey: ["clientes", "selector"] });
    };

    const channel = supabase
      .channel(`cliente-${clienteId}-realtime`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clientes", filter: `id=eq.${clienteId}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "clientes_vehiculos",
          filter: `cliente_id=eq.${clienteId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ordenes_servicio",
          filter: `cliente_id=eq.${clienteId}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cierres", filter: `cliente_id=eq.${clienteId}` },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clienteId, queryClient]);

  if (isLoading) {
    return <div className="text-muted-foreground">Cargando cliente...</div>;
  }
  if (!cliente) {
    return <div className="text-muted-foreground">Cliente no encontrado.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
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
        <Button onClick={() => setOpenNuevaOrden(true)}>
          <Plus /> Nueva orden
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Servicios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{resumen?.serviciosTotal ?? "—"}</div>
            <div className="text-xs text-muted-foreground">
              Último: {resumen?.ultimoServicio ? formatDateTime(resumen.ultimoServicio) : "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">En curso</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{resumen?.serviciosEnCurso ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Pendiente / asignado / en curso</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Por cobrar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-destructive">
              {formatCLP(resumen?.saldoPendiente ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              {resumen?.cierresPendientesTotal ?? 0} cierres en envío / con folio
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Vehículos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{resumen?.vehiculosTotal ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Asociados al cliente</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="vehiculos">Vehículos</TabsTrigger>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="saldo">Saldo</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
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
        <TabsContent value="historial">
          <ChangeHistoryPanel entityType="cliente" entityId={clienteId} />
        </TabsContent>
      </Tabs>

      <Dialog open={openNuevaOrden} onOpenChange={setOpenNuevaOrden}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva orden para {cliente.nombre}</DialogTitle>
            <DialogDescription>
              Completa los pasos para generar la orden. El folio interno se asigna automáticamente.
            </DialogDescription>
          </DialogHeader>
          <NuevaOrdenWizard
            initialClienteId={clienteId}
            onCancel={() => setOpenNuevaOrden(false)}
            onCreated={(id) => {
              setOpenNuevaOrden(false);
              navigate({ to: "/ordenes/$ordenId", params: { ordenId: id } });
            }}
          />
        </DialogContent>
      </Dialog>
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
        <Field
          label="Tipo"
          value={
            <span className="capitalize">
              {(cliente.tipo ?? "").replaceAll("_", " ") || "—"}
            </span>
          }
        />
        <Field label="Email" value={cliente.email} />
        <Field label="Teléfono" value={cliente.telefono} />
        <Field label="Dirección" value={cliente.direccion} />
        <Field label="Condición de pago" value={`${cliente.condicion_pago ?? 0} días`} />
        <Field label="Período de cierre" value={<span className="capitalize">{cliente.periodo_cierre}</span>} />
        <Field label="Requiere folio" value={cliente.requiere_folio ? "Sí" : "No"} />
        <Field label="IVA incluido" value={cliente.iva_incluido ? "Sí" : "No"} />
        <Field
          label="Emails cierres"
          value={
            (cliente.emails_cierre ?? []).length
              ? (cliente.emails_cierre ?? []).join(", ")
              : "—"
          }
        />
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
  const [selectedId, setSelectedId] = useState<string>("");

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
              Selecciona un vehículo existente o agrega uno nuevo desde el catálogo.
            </DialogDescription>
          </DialogHeader>
          <VehiculoSelector
            clienteId={clienteId}
            value={selectedId}
            onChange={(id) => {
              setSelectedId(id);
              setOpen(false);
              queryClient.invalidateQueries({
                queryKey: ["clientes", clienteId, "vehiculos"],
              });
            }}
            allowAddNew
          />
        </DialogContent>
      </Dialog>
    </Card>
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
              <TableHead className="text-right">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : ordenes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
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
              <TableHead className="text-right">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : cierres.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
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
                  <TableCell className="text-right">
                    <Button asChild size="icon" variant="ghost">
                      <Link to="/cierres/$cierreId" params={{ cierreId: c.id }}>
                        <Eye />
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
  );
}

export const Route = createFileRoute("/_app/clientes/$clienteId")({
  component: ClienteDetailPage,
});
