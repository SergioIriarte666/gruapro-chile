import { useRef, useState } from "react";
import { Upload, FileCode2, Loader2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { parseDte, type DteExtraido, type Confidence } from "@/lib/dte-parser";
import { formatCLP } from "@/lib/format";

interface Categoria {
  id: string;
  nombre: string;
}
interface Subcategoria {
  id: string;
  nombre: string;
  categoria_id: string;
  aplica_a: string | null;
}

interface Props {
  categorias: Categoria[];
  subcategorias: Subcategoria[];
  invalidateKeys?: string[][];
}

function badgeFor(c: Confidence) {
  if (c === "ok") return <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>;
  if (c === "warn") return <Badge variant="secondary" className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300"><AlertTriangle className="h-3 w-3" /> Revisar</Badge>;
  return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falta</Badge>;
}

export function DteXmlImporter({ categorias, subcategorias, invalidateKeys = [] }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [storageUrl, setStorageUrl] = useState<string | null>(null);
  const [data, setData] = useState<DteExtraido | null>(null);

  // Editable overrides para revisar/corregir
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [crearProveedor, setCrearProveedor] = useState(false);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [subcategoriaId, setSubcategoriaId] = useState<string | null>(null);

  function reset() {
    setXmlFile(null);
    setStorageUrl(null);
    setData(null);
    setProveedorId(null);
    setCrearProveedor(false);
    setCategoriaId(null);
    setSubcategoriaId(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(file: File) {
    setLoading(true);
    try {
      // 1. Subir respaldo a Storage
      const fileName = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("documentos-xml")
        .upload(fileName, file, { contentType: "application/xml", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("documentos-xml").getPublicUrl(fileName);
      setStorageUrl(pub.publicUrl);
      setXmlFile(file);

      // 2. Parsear
      const text = await file.text();
      const parsed = parseDte(text);
      setData(parsed);

      // 3. Buscar proveedor por RUT
      if (parsed.rut_emisor.valor) {
        const { data: prov } = await supabase
          .from("proveedores")
          .select("id")
          .eq("rut", parsed.rut_emisor.valor)
          .maybeSingle();
        if (prov) {
          setProveedorId(prov.id);
          setCrearProveedor(false);
        } else {
          setProveedorId(null);
          setCrearProveedor(true);
        }
      }

      // 4. Sugerir categoría por nombre
      if (parsed.categoria_sugerida) {
        const cat = categorias.find(
          (c) => c.nombre.toLowerCase() === parsed.categoria_sugerida!.toLowerCase(),
        );
        if (cat) setCategoriaId(cat.id);
      }
    } catch (e: any) {
      toast.error("Error al procesar XML", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function confirmar() {
    if (!data) return;
    const monto = data.monto_neto.valor ?? data.total.valor;
    if (!monto || !data.fecha.valor) {
      toast.error("Faltan campos obligatorios", {
        description: "Fecha y monto son requeridos.",
      });
      return;
    }
    setSaving(true);
    try {
      // Crear proveedor si corresponde
      let provId = proveedorId;
      if (!provId && crearProveedor && data.rut_emisor.valor) {
        const { data: nuevo, error } = await supabase
          .from("proveedores")
          .insert({
            rut: data.rut_emisor.valor,
            nombre: data.nombre_emisor.valor ?? data.rut_emisor.valor,
            giro: data.giro_emisor.valor,
          })
          .select("id")
          .single();
        if (error) throw error;
        provId = nuevo.id;
      }

      const { error } = await supabase.from("costos").insert({
        proveedor_id: provId,
        numero_documento: data.folio.valor,
        fecha: data.fecha.valor,
        monto,
        tipo: "operacional",
        categoria_id: categoriaId,
        subcategoria_id: subcategoriaId,
        archivo_url: storageUrl,
        descripcion: data.nombre_emisor.valor
          ? `DTE ${data.tipo_dte.valor ?? ""} · ${data.nombre_emisor.valor}`
          : null,
      });
      if (error) throw error;

      toast.success("Costo importado desde DTE");
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error("Error al importar", { description: e.message });
    } finally {
      setSaving(false);
    }
  }

  const subcatsFiltradas = categoriaId
    ? subcategorias.filter((s) => s.categoria_id === categoriaId)
    : [];

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileCode2 className="h-4 w-4 mr-2" /> Importar DTE (XML)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar factura DTE desde XML</DialogTitle>
          <DialogDescription>
            Sube el XML descargado desde el SII. Extraemos emisor, folio, fecha y montos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Subir XML
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {xmlFile && <span className="ml-3 text-sm text-muted-foreground">{xmlFile.name}</span>}
          </div>

          {data && (
            <>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-40">Campo</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead className="w-32">Confianza</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <DteRow label="Tipo DTE" campo={data.tipo_dte} />
                    <DteRow label="Folio" campo={data.folio} />
                    <DteRow label="Fecha emisión" campo={data.fecha} />
                    <DteRow label="RUT emisor" campo={data.rut_emisor} />
                    <DteRow label="Razón social" campo={data.nombre_emisor} />
                    <DteRow label="Giro" campo={data.giro_emisor} />
                    <DteRow
                      label="Monto neto"
                      campo={{
                        ...data.monto_neto,
                        valor: data.monto_neto.valor !== null ? formatCLP(data.monto_neto.valor) : null,
                      }}
                    />
                    <DteRow
                      label="IVA"
                      campo={{
                        ...data.iva,
                        valor: data.iva.valor !== null ? formatCLP(data.iva.valor) : null,
                      }}
                    />
                    <DteRow
                      label="Total"
                      campo={{
                        ...data.total,
                        valor: data.total.valor !== null ? formatCLP(data.total.valor) : null,
                      }}
                    />
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Proveedor</Label>
                  {proveedorId ? (
                    <div className="text-sm rounded-md border px-3 py-2 bg-muted/30">
                      Proveedor existente vinculado por RUT.
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm rounded-md border px-3 py-2">
                      <input
                        type="checkbox"
                        checked={crearProveedor}
                        onChange={(e) => setCrearProveedor(e.target.checked)}
                      />
                      <span>Crear proveedor automáticamente</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Categoría {data.categoria_sugerida && <span className="text-xs text-muted-foreground">· sugerida: {data.categoria_sugerida}</span>}</Label>
                  <Select value={categoriaId ?? undefined} onValueChange={(v) => { setCategoriaId(v); setSubcategoriaId(null); }}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label>Subcategoría</Label>
                  <Select value={subcategoriaId ?? undefined} onValueChange={setSubcategoriaId} disabled={!categoriaId}>
                    <SelectTrigger><SelectValue placeholder={categoriaId ? "Seleccionar..." : "Elige una categoría primero"} /></SelectTrigger>
                    <SelectContent>
                      {subcatsFiltradas.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {data && (
            <Button onClick={confirmar} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar e importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DteRow({ label, campo }: { label: string; campo: { valor: any; confianza: Confidence; nota?: string } }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{label}</TableCell>
      <TableCell className="text-sm">
        {campo.valor ?? <span className="text-muted-foreground italic">—</span>}
        {campo.nota && <div className="text-xs text-muted-foreground mt-0.5">{campo.nota}</div>}
      </TableCell>
      <TableCell>{badgeFor(campo.confianza)}</TableCell>
    </TableRow>
  );
}
