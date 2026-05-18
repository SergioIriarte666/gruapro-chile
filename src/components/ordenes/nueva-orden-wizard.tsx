import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  FORMA_PAGO_OPTIONS,
  TIPO_SERVICIO_OPTIONS,
} from "@/lib/ordenes-options";
import type { Tables } from "@/integrations/supabase/types";

type Cliente = Pick<Tables<"clientes">, "id" | "nombre" | "rut">;
type ClienteVehiculo = Pick<Tables<"clientes_vehiculos">, "id" | "patente"> & {
  vehiculos_catalogo: Pick<
    Tables<"vehiculos_catalogo">,
    "marca" | "modelo" | "anio"
  > | null;
};

const step3Schema = z.object({
  tipo_servicio: z.string().min(1, "Selecciona un tipo"),
  origen: z.string().trim().min(1, "Origen obligatorio").max(255),
  destino: z.string().trim().min(1, "Destino obligatorio").max(255),
  fecha_servicio: z.string().min(1, "Fecha obligatoria"),
  monto: z.coerce.number().min(0, "Monto no puede ser negativo"),
  forma_pago: z.string().optional().or(z.literal("")),
  folio_cliente: z.string().trim().max(50).optional().or(z.literal("")),
  folio_siniestro: z.string().trim().max(50).optional().or(z.literal("")),
  observaciones: z.string().trim().max(2000).optional().or(z.literal("")),
});

type Step3Values = z.infer<typeof step3Schema>;

interface Props {
  onCancel: () => void;
  onCreated: (ordenId: string) => void;
}

export function NuevaOrdenWizard({ onCancel, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [clienteId, setClienteId] = useState<string>("");
  const [clienteVehiculoId, setClienteVehiculoId] = useState<string>("");
  const [clientSearch, setClientSearch] = useState("");

  // Step 2
  const [gruaId, setGruaId] = useState<string>("");
  const [operadorId, setOperadorId] = useState<string>("");

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", "selector"],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nombre,rut")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredClientes = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clientes.slice(0, 50);
    return clientes
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          (c.rut ?? "").toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [clientes, clientSearch]);

  const { data: vehiculos = [] } = useQuery({
    queryKey: ["clientes", clienteId, "vehiculos-selector"],
    enabled: !!clienteId,
    queryFn: async (): Promise<ClienteVehiculo[]> => {
      const { data, error } = await supabase
        .from("clientes_vehiculos")
        .select("id,patente,vehiculos_catalogo(marca,modelo,anio)")
        .eq("cliente_id", clienteId);
      if (error) throw error;
      return (data ?? []) as ClienteVehiculo[];
    },
  });

  const { data: gruas = [] } = useQuery({
    queryKey: ["gruas", "activas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gruas")
        .select("id,patente,marca,modelo")
        .eq("estado", "activa")
        .order("patente");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: operadores = [] } = useQuery({
    queryKey: ["operadores", "activos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operadores")
        .select("id,nombre")
        .eq("estado", "activo")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Reset vehicle when cliente changes
  useEffect(() => {
    setClienteVehiculoId("");
  }, [clienteId]);

  const form = useForm<Step3Values>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      tipo_servicio: "",
      origen: "",
      destino: "",
      fecha_servicio: new Date().toISOString().slice(0, 16),
      monto: 0,
      forma_pago: "",
      folio_cliente: "",
      folio_siniestro: "",
      observaciones: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: Step3Values) => {
      const payload = {
        cliente_id: clienteId,
        cliente_vehiculo_id: clienteVehiculoId || null,
        grua_id: gruaId || null,
        operador_id: operadorId || null,
        tipo_servicio: values.tipo_servicio,
        origen: values.origen,
        destino: values.destino,
        fecha_servicio: new Date(values.fecha_servicio).toISOString(),
        monto: values.monto,
        forma_pago: values.forma_pago || null,
        folio_cliente: values.folio_cliente || null,
        folio_siniestro: values.folio_siniestro || null,
        observaciones: values.observaciones || null,
        estado: operadorId ? "asignado" : "pendiente",
      };
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success("Orden creada");
      queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      onCreated(data.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext1 = !!clienteId;
  const canNext2 = !!gruaId && !!operadorId;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center justify-between text-sm">
        {[1, 2, 3].map((n, i) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div
              className={`w-7 h-7 rounded-full grid place-items-center font-medium ${
                step >= n
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step > n ? <Check className="h-4 w-4" /> : n}
            </div>
            <span className={step === n ? "font-medium" : "text-muted-foreground"}>
              {["Cliente y vehículo", "Asignación", "Servicio"][i]}
            </span>
            {n < 3 && <div className="flex-1 h-px bg-border mx-2" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label>Buscar cliente</Label>
            <Input
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Nombre o RUT..."
            />
          </div>
          <div>
            <Label>Cliente *</Label>
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona cliente" />
              </SelectTrigger>
              <SelectContent>
                {filteredClientes.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    Sin resultados
                  </div>
                ) : (
                  filteredClientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre} {c.rut ? `· ${c.rut}` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {clienteId && (
            <div>
              <Label>Vehículo</Label>
              {vehiculos.length === 0 ? (
                <div className="rounded-md border p-3 text-sm text-muted-foreground flex items-center justify-between">
                  Este cliente no tiene vehículos registrados.
                  <Button asChild variant="outline" size="sm">
                    <a
                      href={`/clientes/${clienteId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Plus /> Agregar vehículo
                    </a>
                  </Button>
                </div>
              ) : (
                <Select
                  value={clienteVehiculoId}
                  onValueChange={setClienteVehiculoId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona vehículo (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehiculos.map((v) => {
                      const cat = v.vehiculos_catalogo;
                      const label = cat
                        ? `${cat.marca} ${cat.modelo} ${cat.anio ?? ""} · ${v.patente ?? "—"}`
                        : v.patente ?? "Sin datos";
                      return (
                        <SelectItem key={v.id} value={v.id}>
                          {label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <Label>Grúa *</Label>
            <Select value={gruaId} onValueChange={setGruaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona grúa" />
              </SelectTrigger>
              <SelectContent>
                {gruas.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.patente} · {g.marca ?? ""} {g.modelo ?? ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Operador *</Label>
            <Select value={operadorId} onValueChange={setOperadorId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona operador" />
              </SelectTrigger>
              <SelectContent>
                {operadores.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {step === 3 && (
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => createMutation.mutateAsync(v))}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <FormField
              control={form.control}
              name="tipo_servicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de servicio *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPO_SERVICIO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
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
              name="fecha_servicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fecha del servicio *</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="origen"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Origen *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="destino"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destino *</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="monto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto (CLP)</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="forma_pago"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Forma de pago</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FORMA_PAGO_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
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
              name="folio_cliente"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Folio cliente</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="folio_siniestro"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Folio siniestro</FormLabel>
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
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="md:col-span-2 flex justify-between pt-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft /> Volver
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creando..." : "Crear orden"}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      )}

      {step !== 3 && (
        <div className="flex justify-between pt-2">
          {step === 1 ? (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Cancelar
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => (s - 1) as 1 | 2)}
            >
              <ArrowLeft /> Volver
            </Button>
          )}
          <Button
            type="button"
            disabled={step === 1 ? !canNext1 : !canNext2}
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
          >
            Siguiente <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}
