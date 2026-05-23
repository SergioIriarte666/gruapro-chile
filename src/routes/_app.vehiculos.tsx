import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Power, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { Tables } from "@/integrations/supabase/types";
import {
  createVehiculoSchema,
  VEHICULO_COMBUSTIBLE_OPTIONS,
  VEHICULO_ESTADO_OPTIONS,
  VEHICULO_TIPO_OPTIONS,
} from "@/lib/validations/vehiculos";
import type { z } from "zod";

type VehiculoCatalogo = Tables<"vehiculos_catalogo">;

const PAGE_SIZE = 20;

function tipoVariant(tipo: string | null) {
  switch (tipo) {
    case "Camioneta":
      return "secondary" as const;
    case "Camión":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

function estadoVariant(estado: string | null) {
  return estado === "activo" ? ("default" as const) : ("outline" as const);
}

type VehiculoFormValues = z.input<typeof createVehiculoSchema>;

function VehiculoCatalogoPage() {
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<string>("todos");
  const [estado, setEstado] = useState<string>("activo");
  const [marca, setMarca] = useState<string>("todas");
  const [page, setPage] = useState(1);

  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<VehiculoCatalogo | null>(null);

  const { data: marcas = [] } = useQuery({
    queryKey: ["vehiculos-catalogo", "marcas"],
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

  const { data, isLoading } = useQuery({
    queryKey: ["vehiculos-catalogo", { q, tipo, estado, marca, page }],
    queryFn: async () => {
      const qTrim = q.trim();
      const from = supabase
        .from("vehiculos_catalogo")
        .select("*", { count: "exact" })
        .order("marca")
        .order("modelo");

      const byEstado = estado !== "todos" ? from.eq("estado", estado) : from;
      const byTipo = tipo !== "todos" ? byEstado.eq("tipo", tipo) : byEstado;
      const byMarca = marca !== "todas" ? byTipo.eq("marca", marca) : byTipo;
      const bySearch = qTrim
        ? byMarca.or(`marca.ilike.%${qTrim}%,modelo.ilike.%${qTrim}%`)
        : byMarca;

      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;
      const { data, error, count } = await bySearch.range(start, end);
      if (error) throw error;
      return { rows: (data ?? []) as VehiculoCatalogo[], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const createMutation = useMutation({
    mutationFn: async (values: VehiculoFormValues) => {
      const parsed = createVehiculoSchema.parse(values);
      const marca = parsed.marca;
      const modelo = parsed.modelo;
      const tipo = parsed.tipo;

      const dupQuery = supabase
        .from("vehiculos_catalogo")
        .select("id")
        .eq("marca", marca)
        .eq("modelo", modelo)
        .eq("tipo", tipo)
        .maybeSingle();

      const { data: dup, error: dupErr } = await dupQuery;
      if (dupErr) throw dupErr;
      if (dup) {
        throw new Error("Ya existe un vehículo con esa combinación marca + modelo + tipo");
      }

      const { data: created, error } = await supabase
        .from("vehiculos_catalogo")
        .insert({
          marca,
          modelo,
          anio: null,
          tipo,
          combustible: parsed.combustible || null,
          estado: parsed.estado,
        })
        .select("*")
        .single();
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "vehiculo_catalogo",
          entity_id: created.id,
          action: "created",
          new_value: created,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Vehículo creado");
      setOpenCreate(false);
      queryClient.invalidateQueries({ queryKey: ["vehiculos-catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos_catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; values: VehiculoFormValues }) => {
      const parsed = createVehiculoSchema.parse(vars.values);

      const { count: refCount, error: refErr } = await supabase
        .from("clientes_vehiculos")
        .select("id", { count: "exact", head: true })
        .eq("vehiculo_catalogo_id", vars.id);
      if (refErr) throw refErr;

      const { data: before, error: beforeErr } = await supabase
        .from("vehiculos_catalogo")
        .select("*")
        .eq("id", vars.id)
        .single();
      if (beforeErr) throw beforeErr;

      const next: Partial<VehiculoCatalogo> =
        (refCount ?? 0) > 0
          ? {
              combustible: parsed.combustible || null,
              estado: parsed.estado,
            }
          : {
              marca: parsed.marca,
              modelo: parsed.modelo,
              tipo: parsed.tipo,
              combustible: parsed.combustible || null,
              estado: parsed.estado,
            };

      const { error } = await supabase
        .from("vehiculos_catalogo")
        .update(next)
        .eq("id", vars.id);
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "vehiculo_catalogo",
          entity_id: vars.id,
          action: "updated",
          old_value: before,
          new_value: next,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Vehículo actualizado");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["vehiculos-catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos_catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { count: refCount, error: refErr } = await supabase
        .from("clientes_vehiculos")
        .select("id", { count: "exact", head: true })
        .eq("vehiculo_catalogo_id", id);
      if (refErr) throw refErr;
      if ((refCount ?? 0) > 0) {
        throw new Error("No se puede inactivar: está asignado a clientes");
      }

      const { data: before, error: beforeErr } = await supabase
        .from("vehiculos_catalogo")
        .select("*")
        .eq("id", id)
        .single();
      if (beforeErr) throw beforeErr;

      const { error } = await supabase
        .from("vehiculos_catalogo")
        .update({ estado: "inactivo" })
        .eq("id", id);
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "vehiculo_catalogo",
          entity_id: id,
          action: "inactivated",
          old_value: before,
          new_value: { estado: "inactivo" },
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Vehículo inactivado");
      queryClient.invalidateQueries({ queryKey: ["vehiculos-catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["vehiculos_catalogo"] });
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subtitle = useMemo(
    () =>
      "El catálogo define marca/modelo/tipo. La patente se registra por cliente.",
    [],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Catálogo de vehículos</CardTitle>
            <div className="text-sm text-muted-foreground">{subtitle}</div>
          </div>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus /> Nuevo vehículo
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por marca o modelo..."
                className="pl-8"
              />
            </div>

            <Select
              value={marca}
              onValueChange={(v) => {
                setMarca(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="lg:w-56">
                <SelectValue placeholder="Marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las marcas</SelectItem>
                {marcas.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={tipo}
              onValueChange={(v) => {
                setTipo(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="lg:w-56">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {VEHICULO_TIPO_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={estado}
              onValueChange={(v) => {
                setEstado(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="lg:w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="inactivo">Inactivos</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Marca</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Combustible</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Cargando...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Sin resultados.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.marca}</TableCell>
                      <TableCell>{r.modelo}</TableCell>
                      <TableCell>
                        <Badge variant={tipoVariant(r.tipo)}>{r.tipo ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.combustible ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={estadoVariant(r.estado)} className="capitalize">
                          {r.estado ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar"
                            onClick={() => setEditing(r)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Inactivar"
                            disabled={(r.estado ?? "activo") !== "activo" || inactivateMutation.isPending}
                            onClick={() => inactivateMutation.mutate(r.id)}
                          >
                            <Power />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>
              Mostrando {rows.length} de {total} vehículos
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span>
                Página {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo vehículo</DialogTitle>
            <DialogDescription>Agrega un ítem al catálogo maestro.</DialogDescription>
          </DialogHeader>
          <VehiculoForm
            onCancel={() => setOpenCreate(false)}
            isSubmitting={createMutation.isPending}
            submitLabel="Crear"
            onSubmit={(v) => createMutation.mutateAsync(v)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar vehículo</DialogTitle>
            <DialogDescription>
              {editing ? `${editing.marca} ${editing.modelo}` : ""}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <VehiculoForm
              defaultValues={{
                marca: editing.marca,
                modelo: editing.modelo,
                tipo: (editing.tipo as any) ?? "Auto",
                combustible: editing.combustible ?? "",
                estado: (editing.estado as any) ?? "activo",
              }}
              vehiculoId={editing.id}
              onCancel={() => setEditing(null)}
              isSubmitting={updateMutation.isPending}
              submitLabel="Guardar cambios"
              onSubmit={(v) => updateMutation.mutateAsync({ id: editing.id, values: v })}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VehiculoForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
  vehiculoId,
}: {
  defaultValues?: Partial<VehiculoFormValues>;
  onSubmit: (values: VehiculoFormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
  vehiculoId?: string;
}) {
  const { data: marcas = [] } = useQuery({
    queryKey: ["vehiculos-catalogo", "marcas"],
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

  const { data: refCount = 0 } = useQuery({
    queryKey: ["vehiculos-catalogo", "refcount", vehiculoId],
    enabled: !!vehiculoId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("clientes_vehiculos")
        .select("id", { count: "exact", head: true })
        .eq("vehiculo_catalogo_id", vehiculoId!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const form = useForm<VehiculoFormValues>({
    resolver: zodResolver(createVehiculoSchema),
    defaultValues: {
      marca: "",
      modelo: "",
      tipo: "Auto",
      combustible: "",
      estado: "activo",
      ...defaultValues,
    },
  });

  const locked = (refCount ?? 0) > 0;
  const [marcaSelect, setMarcaSelect] = useState<string>("");

  useEffect(() => {
    const current = form.getValues("marca");
    if (!current) {
      setMarcaSelect("");
      return;
    }
    setMarcaSelect(marcas.includes(current) ? current : "__custom__");
  }, [form, marcas]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => onSubmit(v))}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <FormField
          control={form.control}
          name="marca"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Marca *</FormLabel>
              {locked ? (
                <FormControl>
                  <Input disabled {...field} />
                </FormControl>
              ) : (
                <>
                  <Select
                    value={marcaSelect}
                    onValueChange={(v) => {
                      if (v === "__custom__") {
                        setMarcaSelect(v);
                        field.onChange("");
                        return;
                      }
                      setMarcaSelect(v);
                      field.onChange(v);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona marca" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {marcas.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom__">Nueva marca…</SelectItem>
                    </SelectContent>
                  </Select>
                  {marcaSelect === "__custom__" ? (
                    <FormControl>
                      <Input className="mt-2" placeholder="Escribe la marca" {...field} />
                    </FormControl>
                  ) : null}
                </>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="modelo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Modelo *</FormLabel>
              <FormControl>
                <Input disabled={locked} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="tipo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo *</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={locked}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {VEHICULO_TIPO_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
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
          name="combustible"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Combustible</FormLabel>
              <Select
                value={field.value ? field.value : "__none__"}
                onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona combustible" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">Sin definir</SelectItem>
                  {VEHICULO_COMBUSTIBLE_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
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
          name="estado"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {VEHICULO_ESTADO_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="md:col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Guardando..." : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export const Route = createFileRoute("/_app/vehiculos")({
  component: VehiculoCatalogoPage,
});
