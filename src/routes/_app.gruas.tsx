import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  createGruaSchema,
  ESTADO_GRUA_OPTIONS,
  TIPO_GRUA_OPTIONS,
} from "@/lib/validations/gruas";

type Grua = Tables<"gruas">;

const PAGE_SIZE = 18;

function estadoBadgeClass(estado: string | null) {
  if (estado === "activa") return "bg-green-600 text-white border-green-700";
  if (estado === "en_mantencion")
    return "bg-amber-500 text-white border-amber-600";
  return "bg-muted text-muted-foreground";
}

type GruaFormValues = z.input<typeof createGruaSchema>;

function GruasPage() {
  const queryClient = useQueryClient();
  const [estado, setEstado] = useState<string>("todas");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Grua | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("gruas-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gruas" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["gruas"] });
          queryClient.invalidateQueries({ queryKey: ["gruas", "activas"] });
          queryClient.invalidateQueries({ queryKey: ["gruas-min"] });
          queryClient.invalidateQueries({ queryKey: ["flota-estados"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: flota = { activa: 0, en_mantencion: 0, baja: 0, total: 0 } } =
    useQuery({
      queryKey: ["flota-estados"],
      queryFn: async () => {
        const { data, error } = await supabase.from("gruas").select("estado");
        if (error) throw error;
        const counts = { activa: 0, en_mantencion: 0, baja: 0, total: 0 };
        for (const g of data ?? []) {
          const e = (g as any).estado ?? "activa";
          if (e in counts) (counts as any)[e]++;
          counts.total++;
        }
        return counts;
      },
    });

  const { data, isLoading } = useQuery({
    queryKey: ["gruas", { estado, q, page }],
    queryFn: async () => {
      const qTrim = q.trim();
      const from = supabase
        .from("gruas")
        .select("id,patente,marca,modelo,anio,tipo_grua,estado,foto_url,fecha_incorporacion", {
          count: "exact",
        })
        .order("patente");
      const byEstado = estado !== "todas" ? from.eq("estado", estado) : from;
      const bySearch = qTrim
        ? byEstado.or(`patente.ilike.%${qTrim}%,marca.ilike.%${qTrim}%,modelo.ilike.%${qTrim}%`)
        : byEstado;
      const start = (page - 1) * PAGE_SIZE;
      const end = start + PAGE_SIZE - 1;
      const { data, error, count } = await bySearch.range(start, end);
      if (error) throw error;
      return { rows: (data ?? []) as Grua[], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  const createMutation = useMutation({
    mutationFn: async (values: { form: GruaFormValues; file: File | null }) => {
      const parsed = createGruaSchema.parse(values.form);
      const patente = parsed.patente;

      const { data: existing, error: exErr } = await supabase
        .from("gruas")
        .select("id")
        .eq("patente", patente)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) throw new Error("Ya existe una grúa con esa patente");

      let fotoUrl: string | null = null;
      if (values.file) {
        const ext = values.file.name.split(".").pop() || "jpg";
        const path = `${patente}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("fotos-gruas")
          .upload(path, values.file);
        if (upErr) throw upErr;
        fotoUrl = supabase.storage
          .from("fotos-gruas")
          .getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        patente,
        marca: parsed.marca || null,
        modelo: parsed.modelo || null,
        anio: parsed.anio ?? null,
        tipo_grua: parsed.tipo_grua,
        estado: parsed.estado,
        fecha_incorporacion: parsed.fecha_incorporacion || null,
        foto_url: fotoUrl,
      };

      const { data: created, error } = await supabase
        .from("gruas")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "grua",
          entity_id: created.id,
          action: "created",
          new_value: payload,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Grúa creada");
      setOpenCreate(false);
      queryClient.invalidateQueries({ queryKey: ["gruas"] });
      queryClient.invalidateQueries({ queryKey: ["gruas", "activas"] });
      queryClient.invalidateQueries({ queryKey: ["gruas-min"] });
      queryClient.invalidateQueries({ queryKey: ["flota-estados"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (values: {
      id: string;
      form: GruaFormValues;
      file: File | null;
    }) => {
      const parsed = createGruaSchema.parse(values.form);

      const { data: before, error: beforeErr } = await supabase
        .from("gruas")
        .select("*")
        .eq("id", values.id)
        .single();
      if (beforeErr) throw beforeErr;

      if (parsed.estado === "baja") {
        const { count, error: activeErr } = await supabase
          .from("ordenes_servicio")
          .select("id", { count: "exact", head: true })
          .eq("grua_id", values.id)
          .in("estado", ["pendiente", "en_curso"]);
        if (activeErr) throw activeErr;
        if ((count ?? 0) > 0) {
          throw new Error("No se puede dar de baja una grúa con órdenes activas");
        }
      }

      let fotoUrl: string | null | undefined = undefined;
      if (values.file) {
        const ext = values.file.name.split(".").pop() || "jpg";
        const path = `${parsed.patente}-${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("fotos-gruas")
          .upload(path, values.file);
        if (upErr) throw upErr;
        fotoUrl = supabase.storage
          .from("fotos-gruas")
          .getPublicUrl(path).data.publicUrl;
      }

      const payload = {
        marca: parsed.marca || null,
        modelo: parsed.modelo || null,
        anio: parsed.anio ?? null,
        tipo_grua: parsed.tipo_grua,
        estado: parsed.estado,
        fecha_incorporacion: parsed.fecha_incorporacion || null,
        ...(fotoUrl !== undefined ? { foto_url: fotoUrl } : {}),
      };

      const { error } = await supabase.from("gruas").update(payload).eq("id", values.id);
      if (error) throw error;

      const { error: histErr } = await (supabase as any)
        .from("service_change_history")
        .insert({
          entity_type: "grua",
          entity_id: values.id,
          action: "updated",
          old_value: before,
          new_value: payload,
        });
      if (histErr) throw new Error(histErr.message);
    },
    onSuccess: () => {
      toast.success("Grúa actualizada");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["gruas"] });
      queryClient.invalidateQueries({ queryKey: ["gruas", "activas"] });
      queryClient.invalidateQueries({ queryKey: ["gruas-min"] });
      queryClient.invalidateQueries({ queryKey: ["flota-estados"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const subtitle = useMemo(
    () => `${flota.total} total · ${flota.activa} activas · ${flota.en_mantencion} en mantención · ${flota.baja} bajas`,
    [flota],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Grúas</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus /> Nueva grúa
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
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="activa">Activas</TabsTrigger>
              <TabsTrigger value="en_mantencion">Mantención</TabsTrigger>
              <TabsTrigger value="baja">Baja</TabsTrigger>
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
              placeholder="Buscar por patente, marca o modelo..."
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Cargando...
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-8 text-center text-muted-foreground">
              Sin resultados.
            </CardContent>
          </Card>
        ) : (
          rows.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              <div className="h-36 bg-muted">
                {g.foto_url ? (
                  <img
                    src={g.foto_url}
                    alt={g.patente}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">
                    <Link to="/gruas/$gruaId" params={{ gruaId: g.id }}>
                      {g.patente}
                    </Link>
                  </CardTitle>
                  <Badge className={estadoBadgeClass(g.estado)}>
                    {(g.estado ?? "activa").replaceAll("_", " ")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  {(g.marca ?? "—") + " " + (g.modelo ?? "")}
                </div>
                <div className="text-sm text-muted-foreground">
                  {g.anio ?? "—"} · {(g.tipo_grua ?? "—").replaceAll("_", " ")}
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setEditing(g)}>
                    <Pencil /> Editar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          Mostrando {rows.length} de {total} grúas
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
            <DialogTitle>Nueva grúa</DialogTitle>
            <DialogDescription>Registra una grúa en la flota.</DialogDescription>
          </DialogHeader>
          <GruaForm
            onCancel={() => setOpenCreate(false)}
            isSubmitting={createMutation.isPending}
            submitLabel="Crear"
            onSubmit={(form, file) => createMutation.mutateAsync({ form, file })}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar grúa</DialogTitle>
            <DialogDescription>{editing?.patente}</DialogDescription>
          </DialogHeader>
          {editing ? (
            <GruaForm
              gruaId={editing.id}
              defaultValues={{
                patente: editing.patente,
                marca: editing.marca ?? "",
                modelo: editing.modelo ?? "",
                anio: editing.anio ?? undefined,
                tipo_grua: (editing.tipo_grua as any) ?? "otro",
                estado: (editing.estado as any) ?? "activa",
                fecha_incorporacion: editing.fecha_incorporacion ?? "",
              }}
              existingFotoUrl={editing.foto_url ?? null}
              onCancel={() => setEditing(null)}
              isSubmitting={updateMutation.isPending}
              submitLabel="Guardar cambios"
              onSubmit={(form, file) =>
                updateMutation.mutateAsync({ id: editing.id, form, file })
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GruaForm({
  gruaId,
  defaultValues,
  existingFotoUrl,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: {
  gruaId?: string;
  defaultValues?: Partial<GruaFormValues>;
  existingFotoUrl?: string | null;
  onSubmit: (values: GruaFormValues, file: File | null) => Promise<void> | void;
  onCancel: () => void;
  isSubmitting: boolean;
  submitLabel: string;
}) {
  const form = useForm<GruaFormValues>({
    resolver: zodResolver(createGruaSchema),
    defaultValues: {
      patente: "",
      marca: "",
      modelo: "",
      anio: undefined,
      tipo_grua: "plataforma",
      estado: "activa",
      fecha_incorporacion: "",
      ...defaultValues,
    },
  });

  const [file, setFile] = useState<File | null>(null);
  const previewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return existingFotoUrl ?? null;
  }, [file, existingFotoUrl]);

  useEffect(() => {
    return () => {
      if (file) URL.revokeObjectURL(previewUrl ?? "");
    };
  }, [file, previewUrl]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => onSubmit(v, file))}
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
      >
        <FormField
          control={form.control}
          name="patente"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Patente *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="uppercase"
                  disabled={!!gruaId}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tipo_grua"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo de grúa *</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TIPO_GRUA_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replaceAll("_", " ")}
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
                  {ESTADO_GRUA_OPTIONS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e.replaceAll("_", " ")}
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
          name="fecha_incorporacion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fecha incorporación</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="marca"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Marca</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="modelo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Modelo</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="anio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Año</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={1990}
                  max={2030}
                  value={field.value == null ? "" : String(field.value)}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="md:col-span-2 space-y-2">
          <Label>Foto</Label>
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {previewUrl ? (
            <div className="rounded-md border overflow-hidden">
              <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover" />
            </div>
          ) : null}
        </div>

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

export const Route = createFileRoute("/_app/gruas")({
  component: GruasPage,
});
