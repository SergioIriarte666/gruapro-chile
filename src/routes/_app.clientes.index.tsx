import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";

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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClienteForm } from "@/components/clientes/cliente-form";
import {
  tipoClienteOptions,
  type ClienteFormValues,
} from "@/lib/clientes-schema";
import type { Tables } from "@/integrations/supabase/types";

type Cliente = Tables<"clientes">;

const PAGE_SIZE = 20;

async function fetchClientes(): Promise<Cliente[]> {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return data ?? [];
}

function tipoBadgeVariant(
  tipo: string | null,
): "default" | "secondary" | "outline" {
  switch (tipo) {
    case "aseguradora":
      return "default";
    case "empresa":
      return "secondary";
    default:
      return "outline";
  }
}

function ClientesPage() {
  const queryClient = useQueryClient();
  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: fetchClientes,
  });

  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState<string>("todos");
  const [page, setPage] = useState(1);

  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [deleting, setDeleting] = useState<Cliente | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clientes.filter((c) => {
      const matchSearch =
        !q ||
        c.nombre.toLowerCase().includes(q) ||
        (c.rut ?? "").toLowerCase().includes(q);
      const matchTipo = tipoFilter === "todos" || c.tipo === tipoFilter;
      return matchSearch && matchTipo;
    });
  }, [clientes, search, tipoFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const createMutation = useMutation({
    mutationFn: async (values: ClienteFormValues) => {
      const payload = {
        ...values,
        rut: values.rut || null,
        email: values.email || null,
        telefono: values.telefono || null,
        direccion: values.direccion || null,
        observaciones: values.observaciones || null,
      };
      const { error } = await supabase.from("clientes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente creado");
      setOpenCreate(false);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; values: ClienteFormValues }) => {
      const payload = {
        ...vars.values,
        rut: vars.values.rut || null,
        email: vars.values.email || null,
        telefono: vars.values.telefono || null,
        direccion: vars.values.direccion || null,
        observaciones: vars.values.observaciones || null,
      };
      const { error } = await supabase
        .from("clientes")
        .update(payload)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente actualizado");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clientes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente eliminado");
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Clientes</CardTitle>
          <div className="flex gap-2">
            <ExcelImporter modulo="clientes" invalidateKeys={[["clientes"]]} />
            <Button onClick={() => setOpenCreate(true)}>
              <Plus /> Nuevo cliente
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por nombre o RUT..."
                className="pl-8"
              />
            </div>
            <Select
              value={tipoFilter}
              onValueChange={(v) => {
                setTipoFilter(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los tipos</SelectItem>
                {tipoClienteOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>RUT</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Teléfono</TableHead>
                  <TableHead>Cond. pago</TableHead>
                  <TableHead>Período</TableHead>
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
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No hay clientes que coincidan con los filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>{c.rut ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={tipoBadgeVariant(c.tipo)} className="capitalize">
                          {c.tipo ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>{c.telefono ?? "—"}</TableCell>
                      <TableCell>{c.condicion_pago ?? 0} días</TableCell>
                      <TableCell className="capitalize">{c.periodo_cierre ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="icon" variant="ghost" title="Ver detalle">
                            <Link to="/clientes/$clienteId" params={{ clienteId: c.id }}>
                              <Eye />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar"
                            onClick={() => setEditing(c)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Eliminar"
                            onClick={() => setDeleting(c)}
                          >
                            <Trash2 />
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
              Mostrando {paginated.length} de {filtered.length} clientes
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>
              Completa los datos del cliente. Los campos con * son obligatorios.
            </DialogDescription>
          </DialogHeader>
          <ClienteForm
            onSubmit={(v) => createMutation.mutateAsync(v)}
            onCancel={() => setOpenCreate(false)}
            isSubmitting={createMutation.isPending}
            submitLabel="Crear cliente"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>{editing?.nombre}</DialogDescription>
          </DialogHeader>
          {editing && (
            <ClienteForm
              defaultValues={{
                nombre: editing.nombre,
                rut: editing.rut ?? "",
                tipo: (editing.tipo as ClienteFormValues["tipo"]) ?? "empresa",
                email: editing.email ?? "",
                telefono: editing.telefono ?? "",
                direccion: editing.direccion ?? "",
                condicion_pago: editing.condicion_pago ?? 0,
                requiere_folio: editing.requiere_folio ?? false,
                periodo_cierre:
                  (editing.periodo_cierre as ClienteFormValues["periodo_cierre"]) ?? "mensual",
                iva_incluido: editing.iva_incluido ?? true,
                observaciones: editing.observaciones ?? "",
              }}
              onSubmit={(v) =>
                updateMutation.mutateAsync({ id: editing.id, values: v })
              }
              onCancel={() => setEditing(null)}
              isSubmitting={updateMutation.isPending}
              submitLabel="Guardar cambios"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará{" "}
              <strong>{deleting?.nombre}</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleting && deleteMutation.mutate(deleting.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_app/clientes/")({
  component: ClientesPage,
});
