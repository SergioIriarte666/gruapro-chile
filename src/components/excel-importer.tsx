import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { IMPORT_CONFIGS, resolveLookup, type ImportConfig } from "@/lib/excel-import-configs";

type RowError = { fila: number; campo: string; mensaje: string };
type ParsedState = {
  validRows: Array<{ excelRow: number; payload: Record<string, any>; raw: Record<string, any> }>;
  errors: RowError[];
  errorRaws: Array<Record<string, any>>; // raw rows that errored, for re-download
  headers: string[];
  totalRows: number;
};

interface Props {
  modulo: "servicios" | "costos" | "clientes" | "bodega";
  invalidateKeys?: string[][];
}

export function ExcelImporter({ modulo, invalidateKeys = [] }: Props) {
  const config = IMPORT_CONFIGS[modulo];
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsed, setParsed] = useState<ParsedState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  function resetState() {
    setParsed(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ----- Template -----
  async function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const headers = config.columns.map((c) => c.key);
    const example = config.columns.map((c) => c.example);
    const helpRow = config.columns.map((c) => {
      const parts: string[] = [];
      if (c.required) parts.push("OBLIGATORIO");
      if (c.type === "enum") parts.push(`valores: ${c.enumValues?.join(" | ")}`);
      if (c.type === "date") parts.push("formato: AAAA-MM-DD");
      if (c.lookup) parts.push(`debe existir en ${c.lookup.table}.${c.lookup.matchField}`);
      if (c.description) parts.push(c.description);
      return parts.join(" — ");
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, example, helpRow]);

    // Style header row (bold + blue fill). xlsx CE supports !cols widths; styles need pro version.
    // We still set column widths for usability.
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 2) }));

    // Data validation list for enum columns
    const validations: any[] = [];
    config.columns.forEach((col, idx) => {
      if (col.type === "enum" && col.enumValues) {
        const colLetter = XLSX.utils.encode_col(idx);
        validations.push({
          sqref: `${colLetter}4:${colLetter}1000`,
          type: "list",
          formula1: `"${col.enumValues.join(",")}"`,
        });
      }
    });
    if (validations.length) (ws as any)["!dataValidation"] = validations;

    XLSX.utils.book_append_sheet(wb, ws, config.label.slice(0, 30));

    // Helper sheet with valid enum values
    const enumRows: any[][] = [["Columna", "Valores permitidos"]];
    config.columns.forEach((c) => {
      if (c.type === "enum") enumRows.push([c.key, (c.enumValues ?? []).join(", ")]);
      if (c.lookup) enumRows.push([c.key, `Debe existir en tabla ${c.lookup.table} (${c.lookup.matchField})`]);
    });
    if (enumRows.length > 1) {
      const ws2 = XLSX.utils.aoa_to_sheet(enumRows);
      ws2["!cols"] = [{ wch: 24 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Referencia");
    }

    XLSX.writeFile(wb, `plantilla-${config.module}.xlsx`);
    toast.success("Plantilla descargada");
  }

  // ----- Parse + validate -----
  async function handleFile(file: File) {
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
        header: 1,
        raw: false,
        dateNF: "yyyy-mm-dd",
      }) as unknown as any[][];

      if (!rows.length) {
        toast.error("El archivo está vacío");
        return;
      }
      const headers = (rows[0] ?? []).map((h: any) => String(h ?? "").trim());
      // Data starts at row 4 (index 3): row 1 headers, row 2 example, row 3 instrucciones
      const dataRows = rows
        .slice(3)
        .filter(
          (r) =>
            Array.isArray(r) &&
            r.some((c) => c !== null && c !== undefined && String(c).trim() !== ""),
        );

      const errors: RowError[] = [];
      const validRows: ParsedState["validRows"] = [];
      const errorRaws: Array<Record<string, any>> = [];

      for (let i = 0; i < dataRows.length; i++) {
        const excelRow = i + 4;
        const arr = dataRows[i];
        const raw: Record<string, any> = {};
        headers.forEach((h, idx) => {
          raw[h] = arr[idx];
        });

        const typed: Record<string, any> = {};
        const rowErrs: RowError[] = [];

        for (const col of config.columns) {
          const v = raw[col.key];
          const isEmpty = v === null || v === undefined || String(v).trim() === "";

          if (isEmpty) {
            if (col.required) rowErrs.push({ fila: excelRow, campo: col.key, mensaje: "Campo obligatorio vacío" });
            else typed[col.key] = null;
            continue;
          }

          const sv = String(v).trim();
          switch (col.type) {
            case "number": {
              const n = Number(sv.replace(/[^\d.-]/g, ""));
              if (Number.isNaN(n)) rowErrs.push({ fila: excelRow, campo: col.key, mensaje: `"${sv}" no es número` });
              else typed[col.key] = n;
              break;
            }
            case "date": {
              const d = v instanceof Date ? v : new Date(sv);
              if (Number.isNaN(d.getTime())) {
                rowErrs.push({ fila: excelRow, campo: col.key, mensaje: `Fecha inválida "${sv}"` });
              } else {
                typed[col.key] = d.toISOString().slice(0, 10);
              }
              break;
            }
            case "boolean": {
              const t = sv.toLowerCase();
              if (["true", "1", "si", "sí", "yes", "x"].includes(t)) typed[col.key] = true;
              else if (["false", "0", "no", ""].includes(t)) typed[col.key] = false;
              else rowErrs.push({ fila: excelRow, campo: col.key, mensaje: `Booleano inválido "${sv}"` });
              break;
            }
            case "enum": {
              const match = col.enumValues?.find((x) => x.toLowerCase() === sv.toLowerCase());
              if (!match) rowErrs.push({ fila: excelRow, campo: col.key, mensaje: `Valor "${sv}" no permitido. Use: ${col.enumValues?.join(", ")}` });
              else typed[col.key] = match;
              break;
            }
            case "string":
            default:
              typed[col.key] = sv;
          }

          // Lookup resolution
          if (col.lookup && typed[col.key]) {
            const res = await resolveLookup(col, String(typed[col.key]));
            if (!res.ok) rowErrs.push({ fila: excelRow, campo: col.key, mensaje: res.error });
            else typed[col.key] = res.id;
          }
        }

        if (rowErrs.length) {
          errors.push(...rowErrs);
          errorRaws.push(raw);
        } else {
          validRows.push({ excelRow, payload: config.buildRow(typed), raw });
        }
      }

      setParsed({ validRows, errors, errorRaws, headers, totalRows: dataRows.length });
    } catch (e: any) {
      toast.error("Error al procesar el archivo", { description: e.message });
    } finally {
      setParsing(false);
    }
  }

  // ----- Import -----
  async function importValid() {
    if (!parsed || !parsed.validRows.length) return;
    setImporting(true);
    try {
      const payloads = parsed.validRows.map((r) => r.payload);
      if (config.module === "bodega") {
        const today = new Date().toISOString().slice(0, 10);
        for (const p of payloads as any[]) {
          const cantidad = Number(p.cantidad ?? 0);
          if (!cantidad || cantidad <= 0) throw new Error("Cantidad inválida en bodega");

          const { data: existing, error: findErr } = await supabase
            .from("bodega_items")
            .select("id")
            .ilike("nombre", String(p.nombre))
            .eq("subcategoria_id", p.subcategoria_id ?? null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (findErr) throw findErr;

          let itemId = existing?.id as string | undefined;
          if (!itemId) {
            const { data: created, error: createErr } = await supabase
              .from("bodega_items")
              .insert({
                nombre: String(p.nombre),
                subcategoria_id: p.subcategoria_id ?? null,
                proveedor_id: p.proveedor_id ?? null,
                stock_minimo: Number(p.stock_minimo ?? 0),
                precio_costo: Number(p.precio_costo ?? 0),
                unidad: p.unidad ?? "unidad",
                ubicacion: null,
              })
              .select("id")
              .single();
            if (createErr) throw createErr;
            itemId = (created as any).id as string;
          } else {
            const { error: updErr } = await supabase
              .from("bodega_items")
              .update({
                subcategoria_id: p.subcategoria_id ?? null,
                proveedor_id: p.proveedor_id ?? null,
                stock_minimo: Number(p.stock_minimo ?? 0),
                precio_costo: Number(p.precio_costo ?? 0),
                unidad: p.unidad ?? "unidad",
              })
              .eq("id", itemId);
            if (updErr) throw updErr;
          }

          const { error: movErr } = await supabase.from("bodega_movimientos").insert({
            item_id: itemId,
            tipo: "entrada",
            cantidad,
            fecha: today,
            descripcion: "Importación Excel",
            grua_id: null,
            orden_id: null,
          });
          if (movErr) throw movErr;
        }
      } else {
        const query = supabase.from(config.table as any);
        const { error } = config.conflictField
          ? await query.upsert(payloads as any, { onConflict: config.conflictField })
          : await query.insert(payloads as any);
        if (error) throw error;
      }

      const { error: histErr } = await (supabase as any).from("service_change_history").insert({
        entity_type: "import",
        entity_id: crypto.randomUUID(),
        action: "excel_imported",
        new_value: { module: config.module, table: config.table, total: payloads.length },
      });
      if (histErr) throw new Error(histErr.message);

      toast.success(`${payloads.length} filas importadas`);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setOpen(false);
      resetState();
    } catch (e: any) {
      toast.error("Error al importar", { description: e.message });
    } finally {
      setImporting(false);
    }
  }

  function downloadErrors() {
    if (!parsed) return;
    const wb = XLSX.utils.book_new();
    const headers = config.columns.map((c) => c.key);
    const rows = parsed.errorRaws.map((r) => headers.map((h) => r[h] ?? ""));
    // Append column with the error messages for that row
    const errorsByRow = new Map<number, string[]>();
    parsed.errors.forEach((e) => {
      const list = errorsByRow.get(e.fila) ?? [];
      list.push(`${e.campo}: ${e.mensaje}`);
      errorsByRow.set(e.fila, list);
    });
    const errorFilaList = Array.from(errorsByRow.keys()).sort((a, b) => a - b);
    const rowsWithErr = rows.map((r, i) => [...r, (errorsByRow.get(errorFilaList[i]) ?? []).join(" | ")]);
    const ws = XLSX.utils.aoa_to_sheet([[...headers, "_errores_"], ...rowsWithErr]);
    XLSX.utils.book_append_sheet(wb, ws, "Errores");
    XLSX.writeFile(wb, `errores-${config.module}.xlsx`);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="h-4 w-4 mr-2" /> Importar Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {config.label} desde Excel</DialogTitle>
          <DialogDescription>
            Descarga la plantilla, complétala y súbela. Validamos cada fila antes de insertar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" /> Descargar plantilla
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={parsing}>
              {parsing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Subir archivo
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {parsed && (
            <>
              <div className="flex gap-3 text-sm">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> {parsed.validRows.length} listas
                </Badge>
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" /> {parsed.errorRaws.length} con errores
                </Badge>
                <span className="text-muted-foreground self-center">
                  Total: {parsed.totalRows} filas
                </span>
              </div>

              {parsed.errors.length > 0 && (
                <div className="border rounded-md max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Fila</TableHead>
                        <TableHead className="w-40">Campo</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.errors.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell>{e.fila}</TableCell>
                          <TableCell className="font-mono text-xs">{e.campo}</TableCell>
                          <TableCell className="text-sm">{e.mensaje}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {parsed && parsed.errorRaws.length > 0 && (
            <Button variant="outline" onClick={downloadErrors}>
              <Download className="h-4 w-4 mr-2" /> Descargar filas con error
            </Button>
          )}
          {parsed && parsed.validRows.length > 0 && (
            <Button onClick={importValid} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar {parsed.validRows.length} filas correctas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
