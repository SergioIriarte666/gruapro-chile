import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Tables } from "@/integrations/supabase/types";

type ClienteVehiculoConCatalogo = Pick<
  Tables<"clientes_vehiculos">,
  "id" | "cliente_id" | "vehiculo_catalogo_id" | "patente" | "color" | "observaciones"
> & {
  vehiculos_catalogo: Pick<
    Tables<"vehiculos_catalogo">,
    "id" | "marca" | "modelo" | "anio" | "tipo"
  > | null;
};

export interface VehiculoSelectorProps {
  clienteId: string;
  value?: string;
  onChange: (clienteVehiculoId: string, data: ClienteVehiculoConCatalogo) => void;
  allowAddNew?: boolean;
}

export function VehiculoSelector({
  clienteId,
  value,
  onChange,
  allowAddNew = false,
}: VehiculoSelectorProps) {
  const queryClient = useQueryClient();

  const { data: vehiculos = [], isLoading } = useQuery({
    queryKey: ["clientes", clienteId, "vehiculos-selector-v2"],
    enabled: !!clienteId,
    queryFn: async (): Promise<ClienteVehiculoConCatalogo[]> => {
      const { data, error } = await supabase
        .from("clientes_vehiculos")
        .select("id,cliente_id,vehiculo_catalogo_id,patente,color,observaciones,vehiculos_catalogo(id,marca,modelo,anio,tipo)")
        .eq("cliente_id", clienteId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClienteVehiculoConCatalogo[];
    },
  });

  const selected = useMemo(
    () => vehiculos.find((v) => v.id === value) ?? null,
    [vehiculos, value],
  );

  const options = useMemo(() => {
    return vehiculos.map((v) => {
      const cat = v.vehiculos_catalogo;
      const display = cat
        ? `${cat.marca} ${cat.modelo} ${cat.anio ?? ""} · ${cat.tipo ?? ""} · ${v.patente ?? "—"}`
        : v.patente ?? "Sin datos";
      return { id: v.id, display, data: v };
    });
  }, [vehiculos]);

  const [showAdd, setShowAdd] = useState(false);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [vehiculoCatalogoId, setVehiculoCatalogoId] = useState("");
  const [patente, setPatente] = useState("");
  const [color, setColor] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const { data: marcas = [] } = useQuery({
    queryKey: ["vehiculos-catalogo", "selector", "marcas"],
    enabled: allowAddNew && showAdd,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehiculos_catalogo")
        .select("marca")
        .eq("estado", "activo")
        .order("marca");
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.marca))).sort();
    },
  });

  const { data: modelos = [] } = useQuery({
    queryKey: ["vehiculos-catalogo", "selector", "modelos", marca],
    enabled: allowAddNew && showAdd && !!marca,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehiculos_catalogo")
        .select("modelo")
        .eq("estado", "activo")
        .eq("marca", marca)
        .order("modelo");
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.modelo))).sort();
    },
  });

  const { data: anios = [] } = useQuery({
    queryKey: ["vehiculos-catalogo", "selector", "anios", marca, modelo],
    enabled: allowAddNew && showAdd && !!marca && !!modelo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehiculos_catalogo")
        .select("id,anio,tipo")
        .eq("estado", "activo")
        .eq("marca", marca)
        .eq("modelo", modelo)
        .order("anio", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!vehiculoCatalogoId) {
        throw new Error("Selecciona un vehículo del catálogo");
      }
      const { data, error } = await supabase
        .from("clientes_vehiculos")
        .insert({
          cliente_id: clienteId,
          vehiculo_catalogo_id: vehiculoCatalogoId,
          patente: patente.trim() ? patente.trim().toUpperCase() : null,
          color: color.trim() || null,
          observaciones: observaciones.trim() || null,
        })
        .select("id,cliente_id,vehiculo_catalogo_id,patente,color,observaciones,vehiculos_catalogo(id,marca,modelo,anio,tipo)")
        .single();
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "cliente_vehiculo",
          entity_id: data.id,
          action: "created",
          new_value: data,
        });
      if (histErr) throw new Error(histErr.message);

      return data as unknown as ClienteVehiculoConCatalogo;
    },
    onSuccess: async (data) => {
      toast.success("Vehículo agregado");
      await queryClient.invalidateQueries({
        queryKey: ["clientes", clienteId, "vehiculos-selector-v2"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["clientes", clienteId, "vehiculos"],
      });
      setShowAdd(false);
      setMarca("");
      setModelo("");
      setVehiculoCatalogoId("");
      setPatente("");
      setColor("");
      setObservaciones("");
      onChange(data.id, data);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>Vehículo</Label>
        <Select
          value={value ?? ""}
          onValueChange={(id) => {
            const found = options.find((o) => o.id === id);
            if (found) onChange(id, found.data);
          }}
          disabled={!clienteId || isLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? "Cargando..." : "Selecciona vehículo (opcional)"} />
          </SelectTrigger>
          <SelectContent>
            {options.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground">Sin vehículos registrados.</div>
            ) : (
              options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.display}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {selected?.observaciones ? (
          <div className="text-xs text-muted-foreground mt-1">
            {selected.observaciones}
          </div>
        ) : null}
      </div>

      {allowAddNew ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd((v) => !v)}>
            <Plus /> Agregar vehículo nuevo
          </Button>
        </div>
      ) : null}

      {allowAddNew && showAdd ? (
        <div className="rounded-md border p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Marca *</Label>
              <Select
                value={marca}
                onValueChange={(v) => {
                  setMarca(v);
                  setModelo("");
                  setVehiculoCatalogoId("");
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
            </div>

            <div>
              <Label>Modelo *</Label>
              <Select
                value={modelo}
                onValueChange={(v) => {
                  setModelo(v);
                  setVehiculoCatalogoId("");
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
            </div>

            <div className="md:col-span-2">
              <Label>Año *</Label>
              <Select
                value={vehiculoCatalogoId}
                onValueChange={setVehiculoCatalogoId}
                disabled={!modelo}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona año" />
                </SelectTrigger>
                <SelectContent>
                  {anios.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {(a.anio ?? "Sin año") + (a.tipo ? ` · ${a.tipo}` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Patente</Label>
              <Input
                value={patente}
                onChange={(e) => setPatente(e.target.value.toUpperCase())}
                placeholder="ABCD12"
                className="uppercase"
              />
            </div>

            <div>
              <Label>Color</Label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Observaciones</Label>
            <Textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={addMutation.isPending} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? "Agregando..." : "Agregar"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

