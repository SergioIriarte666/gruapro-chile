import { useMemo, useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { PDFImportService, type PDFConfidence, type PDFExtractResult } from "@/services/PDFImportService";

type Values = {
  numeroOC: string;
  rutCliente: string;
  fecha: string;
  montoTotal: string;
};

function badgeFor(c: PDFConfidence) {
  if (c === "high") return <Badge>Alta</Badge>;
  if (c === "medium") return <Badge variant="secondary">Media</Badge>;
  return <Badge variant="outline">Baja</Badge>;
}

function toValues(extracted: PDFExtractResult): Values {
  const map = new Map(extracted.fields.map((f) => [f.key, f.value]));
  return {
    numeroOC: map.get("numero_oc") === "No detectado" ? "" : (map.get("numero_oc") ?? ""),
    rutCliente: map.get("rut_cliente") === "No detectado" ? "" : (map.get("rut_cliente") ?? ""),
    fecha: map.get("fecha") === "No detectado" ? "" : (map.get("fecha") ?? ""),
    montoTotal: map.get("monto_total") === "No detectado" ? "" : (map.get("monto_total") ?? ""),
  };
}

export function PDFImporter({
  title = "Importar PDF",
  description = "Extraemos campos principales para pre-llenar.",
  confirmLabel = "Confirmar",
  onConfirm,
  disabled,
}: {
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (args: { file: File; values: Values; rawText: string }) => void | Promise<void>;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [extracted, setExtracted] = useState<PDFExtractResult | null>(null);
  const [values, setValues] = useState<Values>({
    numeroOC: "",
    rutCliente: "",
    fecha: "",
    montoTotal: "",
  });
  const [saving, setSaving] = useState(false);

  const fields = useMemo(() => extracted?.fields ?? [], [extracted]);

  function reset() {
    setFile(null);
    setExtracted(null);
    setValues({ numeroOC: "", rutCliente: "", fecha: "", montoTotal: "" });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleFile(f: File) {
    setLoading(true);
    try {
      const res = await PDFImportService.extractFromPDF(f);
      setFile(f);
      setExtracted(res);
      setValues(toValues(res));
    } catch (e: any) {
      toast.error("Error al analizar PDF", { description: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!file || !extracted) return;
    setSaving(true);
    try {
      await onConfirm({ file, values, rawText: extracted.rawText });
      setOpen(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Error al confirmar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <FileText className="h-4 w-4 mr-2" /> {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Subir PDF
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {file && <span className="text-sm text-muted-foreground">{file.name}</span>}
          </div>

          {fields.length > 0 && (
            <>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-48">Campo</TableHead>
                      <TableHead>Valor extraído</TableHead>
                      <TableHead className="w-28">Confianza</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((f) => (
                      <TableRow key={f.key}>
                        <TableCell className="font-medium">{f.key}</TableCell>
                        <TableCell className="text-sm">{f.value}</TableCell>
                        <TableCell>{badgeFor(f.confidence)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>N° OC cliente</Label>
                  <Input
                    value={values.numeroOC}
                    onChange={(e) => setValues((p) => ({ ...p, numeroOC: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>RUT cliente</Label>
                  <Input
                    value={values.rutCliente}
                    onChange={(e) => setValues((p) => ({ ...p, rutCliente: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input
                    value={values.fecha}
                    onChange={(e) => setValues((p) => ({ ...p, fecha: e.target.value }))}
                    placeholder="AAAA-MM-DD"
                  />
                </div>
                <div>
                  <Label>Monto total</Label>
                  <Input
                    type="number"
                    value={values.montoTotal}
                    onChange={(e) => setValues((p) => ({ ...p, montoTotal: e.target.value }))}
                    placeholder="0"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {fields.length > 0 && (
            <Button onClick={confirm} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {confirmLabel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

