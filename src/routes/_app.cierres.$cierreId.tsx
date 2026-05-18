import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  ESTADO_CIERRE_OPTIONS,
  MEDIO_PAGO_OPTIONS,
  estadoCierreLabel,
  estadoCierreVariant,
} from "@/lib/cierres-options";
import { formatCLP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/cierres/$cierreId")({
  component: CierreDetalle,
});

type Cierre = {
  id: string;
  numero: string | null;
  estado: string | null;
  cliente_id: string;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  subtotal: number | null;
  iva: number | null;
  total: number | null;
  folio_cliente: string | null;
  folio_fecha_recepcion: string | null;
  factura_folio_sii: string | null;
  factura_fecha: string | null;
  pago_fecha: string | null;
  pago_monto: number | null;
  pago_medio: string | null;
  pago_referencia: string | null;
  created_at: string | null;
  updated_at: string | null;
  clientes: {
    nombre: string;
    rut: string | null;
    direccion: string | null;
    email: string | null;
    requiere_folio: boolean | null;
  } | null;
};

type Servicio = {
  id: string;
  monto_aplicado: number | null;
  ordenes_servicio: {
    id: string;
    folio_interno: string | null;
    folio_cliente: string | null;
    tipo_servicio: string | null;
    fecha_servicio: string | null;
    monto: number | null;
    origen: string | null;
    destino: string | null;
    clientes_vehiculos: { patente: string | null } | null;
  } | null;
};

function CierreDetalle() {
  const { cierreId } = Route.useParams();
  const queryClient = useQueryClient();

  const [folioInput, setFolioInput] = useState("");
  const [folioFecha, setFolioFecha] = useState(new Date().toISOString().slice(0, 10));
  const [facturaFolio, setFacturaFolio] = useState("");
  const [facturaFecha, setFacturaFecha] = useState(new Date().toISOString().slice(0, 10));
  const [pagoMonto, setPagoMonto] = useState("");
  const [pagoFecha, setPagoFecha] = useState(new Date().toISOString().slice(0, 10));
  const [pagoMedio, setPagoMedio] = useState<string>("transferencia");
  const [pagoRef, setPagoRef] = useState("");

  const { data: cierre, isLoading } = useQuery({
    queryKey: ["cierre", cierreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("*, clientes(nombre,rut,direccion,email,requiere_folio)")
        .eq("id", cierreId)
        .single();
      if (error) throw error;
      return data as Cierre;
    },
  });

  const { data: servicios = [] } = useQuery({
    queryKey: ["cierre-servicios", cierreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierre_servicios")
        .select(
          "id,monto_aplicado,ordenes_servicio(id,folio_interno,folio_cliente,tipo_servicio,fecha_servicio,monto,origen,destino,clientes_vehiculos(patente))",
        )
        .eq("cierre_id", cierreId);
      if (error) throw error;
      return (data ?? []) as unknown as Servicio[];
    },
  });

  const updateCierre = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase
        .from("cierres")
        .update(patch as never)
        .eq("id", cierreId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cierre", cierreId] });
      queryClient.invalidateQueries({ queryKey: ["cierres"] });
      toast.success("Cierre actualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Error al actualizar"),
  });

  if (isLoading || !cierre) {
    return <div className="text-muted-foreground">Cargando…</div>;
  }

  const handleEnviar = () => updateCierre.mutate({ estado: "enviado" });

  const handleRegistrarFolio = () => {
    if (!folioInput.trim()) {
      toast.error("Ingresa el folio del cliente");
      return;
    }
    updateCierre.mutate({
      estado: "con_folio",
      folio_cliente: folioInput.trim(),
      folio_fecha_recepcion: folioFecha,
    });
  };

  const handleRegistrarFactura = () => {
    if (cierre.clientes?.requiere_folio && !cierre.folio_cliente) {
      toast.error("Este cliente requiere folio. Registra el folio antes de facturar.");
      return;
    }
    if (!facturaFolio.trim()) {
      toast.error("Ingresa el folio SII");
      return;
    }
    updateCierre.mutate({
      estado: "facturado",
      factura_folio_sii: facturaFolio.trim(),
      factura_fecha: facturaFecha,
    });
  };

  const handleRegistrarPago = () => {
    const monto = Number(pagoMonto);
    if (!monto || monto <= 0) {
      toast.error("Ingresa un monto válido");
      return;
    }
    updateCierre.mutate({
      estado: "pagado",
      pago_monto: monto,
      pago_fecha: pagoFecha,
      pago_medio: pagoMedio,
      pago_referencia: pagoRef || null,
    });
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Cierre ${cierre.numero ?? cierre.id.slice(0, 8)}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Cliente: ${cierre.clientes?.nombre ?? ""}`, 14, 30);
    if (cierre.clientes?.rut) doc.text(`RUT: ${cierre.clientes.rut}`, 14, 36);
    doc.text(
      `Período: ${formatDate(cierre.periodo_inicio)} - ${formatDate(cierre.periodo_fin)}`,
      14,
      42,
    );
    doc.text(`Estado: ${estadoCierreLabel(cierre.estado)}`, 14, 48);
    if (cierre.folio_cliente) doc.text(`Folio cliente: ${cierre.folio_cliente}`, 14, 54);

    autoTable(doc, {
      startY: 62,
      head: [["Folio int.", "Folio cli.", "Fecha", "Tipo", "Vehículo", "Monto"]],
      body: servicios.map((s) => [
        s.ordenes_servicio?.folio_interno ?? "—",
        s.ordenes_servicio?.folio_cliente ?? "—",
        formatDate(s.ordenes_servicio?.fecha_servicio),
        s.ordenes_servicio?.tipo_servicio ?? "—",
        s.ordenes_servicio?.clientes_vehiculos?.patente ?? "—",
        formatCLP(s.monto_aplicado ?? s.ordenes_servicio?.monto),
      ]),
    });

    const endY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Subtotal: ${formatCLP(cierre.subtotal)}`, 140, endY);
    doc.text(`IVA: ${formatCLP(cierre.iva)}`, 140, endY + 6);
    doc.setFontSize(12);
    doc.text(`Total: ${formatCLP(cierre.total)}`, 140, endY + 14);

    doc.save(`cierre-${cierre.numero ?? cierre.id.slice(0, 8)}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/cierres">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              Cierre {cierre.numero ?? cierre.id.slice(0, 8)}
            </h1>
            <p className="text-sm text-muted-foreground">
              {cierre.clientes?.nombre} · {formatDate(cierre.periodo_inicio)} →{" "}
              {formatDate(cierre.periodo_fin)}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={exportarPDF}>
          <Download className="h-4 w-4 mr-2" /> Exportar PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Servicios incluidos ({servicios.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio interno</TableHead>
                    <TableHead>Folio cliente</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Vehículo</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servicios.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.ordenes_servicio?.folio_interno ?? "—"}</TableCell>
                      <TableCell>{s.ordenes_servicio?.folio_cliente ?? "—"}</TableCell>
                      <TableCell>{formatDate(s.ordenes_servicio?.fecha_servicio)}</TableCell>
                      <TableCell className="capitalize">
                        {s.ordenes_servicio?.tipo_servicio ?? "—"}
                      </TableCell>
                      <TableCell>
                        {s.ordenes_servicio?.clientes_vehiculos?.patente ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCLP(s.monto_aplicado ?? s.ordenes_servicio?.monto)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal:</span>
                <span>{formatCLP(cierre.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA 19%:</span>
                <span>{formatCLP(cierre.iva)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t pt-1 text-base">
                <span>Total:</span>
                <span>{formatCLP(cierre.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                Estado
                <Badge variant={estadoCierreVariant(cierre.estado)}>
                  {estadoCierreLabel(cierre.estado)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cierre.clientes?.requiere_folio && !cierre.folio_cliente && (
                <p className="text-xs text-destructive">
                  Este cliente requiere folio para poder facturar.
                </p>
              )}

              {cierre.estado === "abierto" && (
                <Button className="w-full" onClick={handleEnviar} disabled={updateCierre.isPending}>
                  Enviar al cliente
                </Button>
              )}

              {cierre.estado === "enviado" && (
                <div className="space-y-2">
                  <Label>Folio del cliente</Label>
                  <Input
                    value={folioInput}
                    onChange={(e) => setFolioInput(e.target.value)}
                    placeholder="Ej: HES-12345"
                  />
                  <Label>Fecha recepción</Label>
                  <Input
                    type="date"
                    value={folioFecha}
                    onChange={(e) => setFolioFecha(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={handleRegistrarFolio}
                    disabled={updateCierre.isPending}
                  >
                    Registrar folio
                  </Button>
                </div>
              )}

              {cierre.estado === "con_folio" && (
                <div className="space-y-2">
                  <Label>Folio SII</Label>
                  <Input
                    value={facturaFolio}
                    onChange={(e) => setFacturaFolio(e.target.value)}
                    placeholder="N° factura SII"
                  />
                  <Label>Fecha factura</Label>
                  <Input
                    type="date"
                    value={facturaFecha}
                    onChange={(e) => setFacturaFecha(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={handleRegistrarFactura}
                    disabled={updateCierre.isPending}
                  >
                    Registrar factura
                  </Button>
                </div>
              )}

              {cierre.estado === "facturado" && (
                <div className="space-y-2">
                  <Label>Fecha de pago</Label>
                  <Input
                    type="date"
                    value={pagoFecha}
                    onChange={(e) => setPagoFecha(e.target.value)}
                  />
                  <Label>Monto</Label>
                  <Input
                    type="number"
                    value={pagoMonto}
                    onChange={(e) => setPagoMonto(e.target.value)}
                    placeholder={String(cierre.total ?? "")}
                  />
                  <Label>Medio</Label>
                  <Select value={pagoMedio} onValueChange={setPagoMedio}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDIO_PAGO_OPTIONS.map((m) => (
                        <SelectItem key={m} value={m} className="capitalize">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label>Referencia</Label>
                  <Input
                    value={pagoRef}
                    onChange={(e) => setPagoRef(e.target.value)}
                    placeholder="N° transferencia / cheque"
                  />
                  <Button
                    className="w-full"
                    onClick={handleRegistrarPago}
                    disabled={updateCierre.isPending}
                  >
                    Registrar pago
                  </Button>
                </div>
              )}

              {cierre.estado === "pagado" && (
                <p className="text-sm text-muted-foreground">
                  Cierre pagado el {formatDate(cierre.pago_fecha)} · {formatCLP(cierre.pago_monto)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Creado</span>
                <span>{formatDate(cierre.created_at)}</span>
              </div>
              {cierre.folio_fecha_recepcion && (
                <div className="flex justify-between">
                  <span>Folio recibido</span>
                  <span>{formatDate(cierre.folio_fecha_recepcion)}</span>
                </div>
              )}
              {cierre.factura_fecha && (
                <div className="flex justify-between">
                  <span>Facturado · {cierre.factura_folio_sii}</span>
                  <span>{formatDate(cierre.factura_fecha)}</span>
                </div>
              )}
              {cierre.pago_fecha && (
                <div className="flex justify-between">
                  <span>Pagado · {cierre.pago_medio}</span>
                  <span>{formatDate(cierre.pago_fecha)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Última act.</span>
                <span>{formatDate(cierre.updated_at)}</span>
              </div>
              <div className="pt-2">
                <Label className="text-xs">Cambiar estado (admin)</Label>
                <Select
                  value={cierre.estado ?? ""}
                  onValueChange={(v) => updateCierre.mutate({ estado: v })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADO_CIERRE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
