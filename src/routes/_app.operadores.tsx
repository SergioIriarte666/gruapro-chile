import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCLP, formatDate } from "@/lib/format";
import { createOperadorSchema } from "@/lib/validations/operadores";

type Operador = Tables<"operadores">;
type Comision = Tables<"comisiones">;

const PAGE_SIZE = 20;

function estadoVariant(estado: string | null) {
  if (estado === "activo") return "default" as const;
  if (estado === "vacaciones") return "secondary" as const;
  return "outline" as const;
}

function licenciaBadge(
  vencimiento: string | null,
): { variant: "default" | "secondary" | "outline" | "destructive"; text: string } {
  if (!vencimiento) return { variant: "outline", text: "Sin fecha" };
  const d = new Date(vencimiento);
  if (Number.isNaN(d.getTime())) return { variant: "outline", text: "Sin fecha" };
  const days = Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { variant: "destructive", text: "Vencida" };
  if (days <= 30) return { variant: "secondary", text: "Por vencer" };
  return { variant: "outline", text: "Vigente" };
}

type OperadorFormValues = z.input<typeof createOperadorSchema>;

function OperadoresPage() {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<string>("todos");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Operador | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("operadores-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "operadores" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["operadores"] });
          queryClient.invalidateQueries({ queryKey: ["operadores", "activos"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comisiones" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["operadores"] });
          queryClient.invalidateQueries({ queryKey: ["comisiones"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data, isLoading } = useQuery({
    queryKey: ["operadores", { estado, q, page }],
    queryFn: async () => {
      const qTrim = q.trim();
      const from = supabase
        .from("operadores")
        .select("id,nombre,rut,telefono,licencia_clase,licencia_vencimiento,tipo_contrato,sueldo_base,estado,created_at,updated_at", {
          count: "exact",
        })
        .order("nombre");

      const byEstado = estado !== "todos" ? from.eq("estado", estado) : from;
      const bySearch = qTrim
        ? byEstado.or(`nombre.ilike.%${qTrim}%,rut.ilike.%${qTrim}%`)
        : byEstado;

      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;
      const { data, error, count } = await bySearch.range(start, end);
      if (error) throw error;

      const rows = (data ?? []) as Operador[];
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) {
        return { rows, total: count ?? 0, pendientes: {} as Record<string, number>, pendingTotal: 0 };
      }

      const { data: comData, error: comErr } = await supabase
        .from("comisiones")
        .select("operador_id,monto_comision,estado")
        .in("operador_id", ids)
        .eq("estado", "pendiente");
      if (comErr) throw comErr;

      const pendientes: Record<string, number> = {};
      let pendingTotal = 0;
      for (const c of (comData ?? []) as unknown as Comision[]) {
        const monto = Number(c.monto_comision ?? 0);
        pendientes[c.operador_id] = (pendientes[c.operador_id] ?? 0) + monto;
        pendingTotal += monto;
      }

      return { rows, total: count ?? 0, pendientes, pendingTotal };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pendientes = data?.pendientes ?? {};
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const { data: resumen = { activos: 0, vacaciones: 0, inactivos: 0, pendingTotal: 0 } } = useQuery({
    queryKey: ["operadores", "resumen-global"],
    queryFn: async () => {
      const [{ data: operadoresData, error: opErr }, { data: comisionesData, error: comErr }] =
        await Promise.all([
          supabase.from("operadores").select("estado"),
          supabase
            .from("comisiones")
            .select("monto_comision")
            .eq("estado", "pendiente"),
        ]);

      if (opErr) throw opErr;
      if (comErr) throw comErr;

      let activos = 0;
      let vacaciones = 0;
      let inactivos = 0;
      for (const row of operadoresData ?? []) {
        if (row.estado === "activo") activos += 1;
        else if (row.estado === "vacaciones") vacaciones += 1;
        else if (row.estado === "inactivo") inactivos += 1;
      }

      const pendingTotal = (comisionesData ?? []).reduce(
        (acc, row: any) => acc + Number(row.monto_comision ?? 0),
        0,
      );

      return { activos, vacaciones, inactivos, pendingTotal };
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: OperadorFormValues) => {
      const parsed = createOperadorSchema.parse(values);
      const payload = {
        nombre: parsed.nombre,
        rut: parsed.rut || null,
        telefono: parsed.telefono || null,
        licencia_clase: parsed.licencia_clase ?? null,
        licencia_vencimiento: parsed.licencia_vencimiento || null,
        tipo_contrato: parsed.tipo_contrato,
        sueldo_base: Number(parsed.sueldo_base ?? 0),
        estado: parsed.estado,
      };

      const { data, error } = await supabase
        .from("operadores")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "operador",
          entity_id: data.id,
          action: "created",
          new_value: payload,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Operador creado");
      setOpenCreate(false);
      queryClient.invalidateQueries({ queryKey: ["operadores"] });
      queryClient.invalidateQueries({ queryKey: ["operadores", "activos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => {
      if (e?.code === "23505") {
        toast.error("Ya existe un operador con ese RUT");
        return;
      }
      toast.error((e as Error).message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; values: OperadorFormValues }) => {
      const parsed = createOperadorSchema.parse(vars.values);

      const { data: before, error: beforeErr } = await supabase
        .from("operadores")
        .select("*")
        .eq("id", vars.id)
        .single();
      if (beforeErr) throw beforeErr;

      if (before.estado === "activo" && parsed.estado !== "activo") {
        const { count, error: activeErr } = await supabase
          .from("ordenes_servicio")
          .select("id", { count: "exact", head: true })
          .eq("operador_id", vars.id)
          .in("estado", ["pendiente", "en_curso"]);
        if (activeErr) throw activeErr;
        if ((count ?? 0) > 0) {
          throw new Error("No se puede inactivar: tiene órdenes activas");
        }
      }

      const payload = {
        nombre: parsed.nombre,
        rut: parsed.rut || null,
        telefono: parsed.telefono || null,
        licencia_clase: parsed.licencia_clase ?? null,
        licencia_vencimiento: parsed.licencia_vencimiento || null,
        tipo_contrato: parsed.tipo_contrato,
        sueldo_base: Number(parsed.sueldo_base ?? 0),
        estado: parsed.estado,
      };

      const { error } = await supabase.from("operadores").update(payload).eq("id", vars.id);
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "operador",
          entity_id: vars.id,
          action: "updated",
          old_value: before,
          new_value: payload,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Operador actualizado");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["operadores"] });
      queryClient.invalidateQueries({ queryKey: ["operadores", "activos"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operadores</h1>
          <p className="text-sm text-muted-foreground">
            {resumen.activos} activos · {resumen.vacaciones} vacaciones · {resumen.inactivos} inactivos · {formatCLP(resumen.pendingTotal)} pendientes
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus /> Nuevo operador
        </Button>
      </div>

      <Card>
        <CardContent className="py-4 space-y-4">
          <Tabs
            value={estado}
            onValueChange={(v) => {
              setEstado(v);
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="activo">Activos</TabsTrigger>
              <TabsTrigger value="vacaciones">Vacaciones</TabsTrigger>
              <TabsTrigger value="inactivo">Inactivos</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por nombre o RUT..."
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-2">Nombre</th>
              <th className="text-left p-2">RUT</th>
              <th className="text-left p-2">Licencia</th>
              <th className="text-left p-2">Contrato</th>
              <th className="text-left p-2">Estado</th>
              <th className="text-right p-2">Pendiente</th>
              <th className="text-right p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Cargando...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              rows.map((o) => {
                const lic = licenciaBadge(o.licencia_vencimiento);
                return (
                  <tr key={o.id} className="border-t">
                    <td className="p-2 font-medium">{o.nombre}</td>
                    <td className="p-2">{o.rut ?? "—"}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {o.licencia_clase ?? "—"} {o.licencia_vencimiento ? `· ${formatDate(o.licencia_vencimiento)}` : ""}
                        </span>
                        <Badge variant={lic.variant} className="capitalize">
                          {lic.text}
                        </Badge>
                      </div>
                    </td>
                    <td className="p-2 capitalize">{o.tipo_contrato ?? "—"}</td>
                    <td className="p-2">
                      <Badge variant={estadoVariant(o.estado)} className="capitalize">
                        {o.estado ?? "—"}
                      </Badge>
                    </td>
                    <td className="p-2 text-right font-medium">
                      {formatCLP(pendientes[o.id] ?? 0)}
                    </td>
                    <td className="p-2">
                      <div className="flex justify-end gap-1">
                        <Button asChild size="icon" variant="ghost" title="Ver">
                          <Link to="/operadores/$operadorId" params={{ operadorId: o.id }}>
                            <Eye />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          onClick={() => setEditing(o)}
                        >
                          <Pencil />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Mostrando {rows.length} de {total} operadores
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

      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo operador</DialogTitle>
            <DialogDescription>Registra un operador para asignación de órdenes.</DialogDescription>
          </DialogHeader>
          <OperadorForm
            onCancel={() => setOpenCreate(false)}
            isSubmitting={createMutation.isPending}
            submitLabel="Crear"
            onSubmit={(v) => createMutation.mutateAsync(v)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar operador</DialogTitle>
            <DialogDescription>{editing?.nombre}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <OperadorForm
              defaultValues={{
                nombre: editing.nombre,
                rut: editing.rut ?? "",
                telefono: editing.telefono ?? "",
                licencia_clase: (editing.licencia_clase as any) ?? undefined,
                licencia_vencimiento: editing.licencia_vencimiento ?? "",
                tipo_contrato: (editing.tipo_contrato as any) ?? "planta",
                sueldo_base: Number(editing.sueldo_base ?? 0),
                estado: (editing.estado as any) ?? "activo",
              }}
              onCancel={() => setEditing(null)}
              isSubmitting={updateMutation.isPending}
              submitLabel="Guardar cambios"
              onSubmit={(v) => updateMutation.mutateAsync({ id: editing.id, values: v })}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OperadorForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: {
  defaultValues?: Partial<OperadorFormValues>;
  onSubmit: (values: OperadorFormValues) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  const form = useForm<OperadorFormValues>({
    resolver: zodResolver(createOperadorSchema),
    defaultValues: {
      nombre: "",
      rut: "",
      telefono: "",
      licencia_clase: undefined,
      licencia_vencimiento: "",
      tipo_contrato: "planta",
      sueldo_base: 0,
      estado: "activo",
      ...defaultValues,
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => onSubmit(v))} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="nombre"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Nombre *</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="rut"
          render={({ field }) => (
            <FormItem>
              <FormLabel>RUT</FormLabel>
              <FormControl>
                <Input placeholder="12.345.678-9" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="telefono"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Teléfono</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="licencia_clase"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Clase licencia</FormLabel>
              <Select
                value={field.value ?? "__none__"}
                onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">Sin clase</SelectItem>
                  {["A1", "A2", "A3", "A4", "A5"].map((c) => (
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
          name="licencia_vencimiento"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vencimiento licencia</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tipo_contrato"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo contrato *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {[
                    { v: "planta", l: "Planta" },
                    { v: "honorarios", l: "Honorarios" },
                    { v: "externo", l: "Externo" },
                  ].map((o) => (
                    <SelectItem key={o.v} value={o.v}>
                      {o.l}
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
          name="sueldo_base"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sueldo base</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  value={field.value == null ? "" : String(field.value)}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
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
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="vacaciones">Vacaciones</SelectItem>
                  <SelectItem value="inactivo">Inactivo</SelectItem>
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

export const Route = createFileRoute("/_app/operadores")({
  component: OperadoresPage,
});
