import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { calcTotales } from "@/lib/cierres-options";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Cliente = {
  id: string;
  nombre: string;
  iva_incluido: boolean | null;
  requiere_folio: boolean | null;
};

type ServicioDisponible = {
  id: string;
  folio_interno: string | null;
  folio_cliente: string | null;
  tipo_servicio: string | null;
  monto: number | null;
  fecha_servicio: string | null;
  clientes_vehiculos: { patente: string | null } | null;
};

const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export function NuevoCierreDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clienteId, setClienteId] = useState<string>("");
  const [fechaInicio, setFechaInicio] = useState<string>(firstOfMonth());
  const [fechaFin, setFechaFin] = useState<string>(today());
  const [seleccionados, setSeleccionados] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) {
      setClienteId("");
      setSeleccionados({});
    }
  }, [open]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nombre,iva_incluido,requiere_folio")
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Cliente[];
    },
  });

  const cliente = clientes.find((c) => c.id === clienteId);

  const { data: servicios = [], isFetching } = useQuery({
    queryKey: ["servicios-disponibles", clienteId, fechaInicio, fechaFin],
    enabled: !!clienteId && !!fechaInicio && !!fechaFin,
    queryFn: async () => {
      // 1) Obtener orden_ids ya usados en cierres no anulados
      const { data: usados, error: errU } = await supabase
        .from("cierre_servicios")
        .select("orden_id, cierres!inner(estado)")
        .neq("cierres.estado", "anulado");
      if (errU) throw errU;
      const excluidos = new Set((usados ?? []).map((u: any) => u.orden_id));

      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select(
          "id,folio_interno,folio_cliente,tipo_servicio,monto,fecha_servicio,clientes_vehiculos(patente)",
        )
        .eq("cliente_id", clienteId)
        .eq("estado", "completado")
        .gte("fecha_servicio", fechaInicio)
        .lte("fecha_servicio", `${fechaFin}T23:59:59`)
        .order("fecha_servicio", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ServicioDisponible[]).filter(
        (s) => !excluidos.has(s.id),
      );
    },
  });

  useEffect(() => {
    // Auto-seleccionar todos al cargar
    const map: Record<string, boolean> = {};
    for (const s of servicios) map[s.id] = true;
    setSeleccionados(map);
  }, [servicios]);

  const seleccionadosArr = useMemo(
    () => servicios.filter((s) => seleccionados[s.id]),
    [servicios, seleccionados],
  );

  const montoSum = seleccionadosArr.reduce((acc, s) => acc + Number(s.monto ?? 0), 0);
  const totales = calcTotales(montoSum, cliente?.iva_incluido ?? true);

  const crear = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecciona un cliente");
      if (seleccionadosArr.length === 0) throw new Error("Selecciona al menos un servicio");

      const numero = `C-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      const { data: cierre, error } = await supabase
        .from("cierres")
        .insert({
          numero,
          cliente_id: clienteId,
          periodo_inicio: fechaInicio,
          periodo_fin: fechaFin,
          subtotal: totales.subtotal,
          iva: totales.iva,
          total: totales.total,
          estado: "abierto",
        })
        .select("id")
        .single();
      if (error) throw error;

      const filas = seleccionadosArr.map((s) => ({
        cierre_id: cierre.id,
        orden_id: s.id,
        monto_aplicado: Number(s.monto ?? 0),
      }));
      const { error: errIns } = await supabase.from("cierre_servicios").insert(filas);
      if (errIns) throw errIns;
      return cierre.id as string;
    },
    onSuccess: (id) => {
      toast.success("Cierre creado");
      queryClient.invalidateQueries({ queryKey: ["cierres"] });
      onOpenChange(false);
      navigate({ to: "/cierres/$cierreId", params: { cierreId: id } });
    },
    onError: (e: any) => toast.error(e.message ?? "Error al crear cierre"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo cierre de período</DialogTitle>
          <DialogDescription>
            Selecciona cliente y período. Se mostrarán los servicios completados
            disponibles (no incluidos en otros cierres activos).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Fecha inicio</Label>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Fecha fin</Label>
            <Input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
        </div>

        {clienteId && (
          <div className="border rounded-md mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Folio interno</TableHead>
                  <TableHead>Folio cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFetching ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Cargando…
                    </TableCell>
                  </TableRow>
                ) : servicios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No hay servicios disponibles en el período.
                    </TableCell>
                  </TableRow>
                ) : (
                  servicios.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Checkbox
                          checked={!!seleccionados[s.id]}
                          onCheckedChange={(v) =>
                            setSeleccionados((prev) => ({ ...prev, [s.id]: !!v }))
                          }
                        />
                      </TableCell>
                      <TableCell>{s.folio_interno ?? "—"}</TableCell>
                      <TableCell>{s.folio_cliente ?? "—"}</TableCell>
                      <TableCell>{formatDate(s.fecha_servicio)}</TableCell>
                      <TableCell className="capitalize">{s.tipo_servicio ?? "—"}</TableCell>
                      <TableCell>{s.clientes_vehiculos?.patente ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatCLP(s.monto)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {clienteId && servicios.length > 0 && (
          <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Servicios seleccionados:</span>
              <span>{seleccionadosArr.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal:</span>
              <span>{formatCLP(totales.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">IVA 19%:</span>
              <span>{formatCLP(totales.iva)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-1">
              <span>Total:</span>
              <span>{formatCLP(totales.total)}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => crear.mutate()}
            disabled={crear.isPending || seleccionadosArr.length === 0}
          >
            {crear.isPending ? "Creando…" : "Crear cierre"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
