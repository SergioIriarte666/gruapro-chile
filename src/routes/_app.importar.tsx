import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, FileCode2, FileText } from "lucide-react";
import { toast } from "sonner";

import { ExcelImporter } from "@/components/excel-importer";
import { DteXmlImporter } from "@/components/dte-xml-importer";
import { PDFImporter } from "@/components/pdf-importer";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

type Categoria = { id: string; nombre: string; activa: boolean | null };
type Subcategoria = { id: string; nombre: string; categoria_id: string; activa: boolean | null; aplica_a: string | null };

type HistoryRow = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string | null;
  new_value: any;
};

export const Route = createFileRoute("/_app/importar")({
  component: ImportarPage,
});

function ImportarPage() {
  const qc = useQueryClient();

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias-costo", "importadores"],
    queryFn: async (): Promise<Categoria[]> => {
      const { data, error } = await supabase
        .from("categorias_costo")
        .select("id,nombre,activa")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: subcategorias = [] } = useQuery({
    queryKey: ["subcategorias-costo", "importadores"],
    queryFn: async (): Promise<Subcategoria[]> => {
      const { data, error } = await supabase
        .from("subcategorias_costo")
        .select("id,nombre,categoria_id,activa,aplica_a")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["importadores-historial"],
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await (supabase as any)
        .from("service_change_history")
        .select("id,action,entity_type,created_at,new_value")
        .in("action", ["dte_imported", "excel_imported", "pdf_imported"])
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return [];
      return (data ?? []) as any;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Importadores</h1>
        <p className="text-sm text-muted-foreground">
          Importa datos desde Excel, XML DTE y PDF. No se guarda nada sin confirmación.
        </p>
      </div>

      <Tabs defaultValue="excel">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="excel" className="gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </TabsTrigger>
          <TabsTrigger value="xml" className="gap-2">
            <FileCode2 className="h-4 w-4" /> XML DTE
          </TabsTrigger>
          <TabsTrigger value="pdf" className="gap-2">
            <FileText className="h-4 w-4" /> PDF
          </TabsTrigger>
        </TabsList>

        <TabsContent value="excel" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Carga masiva (Excel)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <ExcelImporter modulo="servicios" invalidateKeys={[["ordenes"]]} />
              <ExcelImporter modulo="costos" invalidateKeys={[["costos"]]} />
              <ExcelImporter modulo="clientes" invalidateKeys={[["clientes"]]} />
              <ExcelImporter
                modulo="bodega"
                invalidateKeys={[
                  ["bodega"],
                  ["bodega", "items"],
                  ["bodega", "movimientos"],
                  ["bodega", "alertas-count"],
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="xml" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Importar DTE (XML)</CardTitle>
            </CardHeader>
            <CardContent>
              <DteXmlImporter
                categorias={categorias.filter((c) => c.activa !== false)}
                subcategorias={subcategorias.filter((s) => s.activa !== false)}
                invalidateKeys={[["costos"]]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Analizar PDF</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <PDFImporter
                title="Analizar documento"
                description="Extrae campos (OC, RUT, fecha, monto) y permite corregir antes de usar."
                confirmLabel="Guardar en historial"
                onConfirm={async ({ values, rawText }) => {
                  const { error } = await (supabase as any).from("service_change_history").insert({
                    entity_type: "import",
                    entity_id: crypto.randomUUID(),
                    action: "pdf_imported",
                    new_value: { values, rawText },
                  });
                  if (error) throw new Error(error.message);
                  toast.success("PDF analizado");
                  qc.invalidateQueries({ queryKey: ["importadores-historial"] });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial reciente</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Detalle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Sin registros.
                  </TableCell>
                </TableRow>
              ) : (
                history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatDateTime(h.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{h.action}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{h.entity_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {h.action === "excel_imported"
                        ? `Módulo: ${h.new_value?.module ?? "—"} · filas: ${h.new_value?.total ?? "—"}`
                        : h.action === "dte_imported"
                          ? `Folio: ${h.new_value?.folio ?? "—"} · monto: ${h.new_value?.monto ?? "—"}`
                          : h.action === "pdf_imported"
                            ? `OC: ${h.new_value?.values?.numeroOC ?? "—"}`
                            : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
