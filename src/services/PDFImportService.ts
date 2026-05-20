import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type PDFConfidence = "high" | "medium" | "low";

export type PDFExtractedField = {
  key: string;
  value: string;
  confidence: PDFConfidence;
};

export type PDFExtractResult = {
  fields: PDFExtractedField[];
  rawText: string;
};

function normalizeMoney(raw: string) {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  if (hasComma && hasDot) {
    return Number(cleaned.replace(/\./g, "").replace(",", "."));
  }
  return Number(cleaned.replace(/,/g, ""));
}

function parseDate(raw: string) {
  const s = raw.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  if (iso) return iso;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addField(fields: PDFExtractedField[], key: string, value: string | null, confidence: PDFConfidence) {
  if (value == null || value.trim() === "") {
    fields.push({ key, value: "No detectado", confidence: "low" });
    return;
  }
  fields.push({ key, value, confidence });
}

export class PDFImportService {
  static async extractFromPDF(file: File): Promise<PDFExtractResult> {
    const buf = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data: buf }).promise;
    const texts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = (content.items as any[]).map((it) => it.str).join(" ");
      texts.push(pageText);
    }
    const rawText = texts.join("\n");

    const numeroOC = rawText.match(/(?:N[°º]?\s*OC|Orden\s+de\s+Compra)[:\s]+([A-Z0-9\-]+)/i)?.[1] ?? null;
    const rut = rawText.match(/RUT[:\s]+(\d{1,2}\.\d{3}\.\d{3}-[\dkK])/i)?.[1] ?? null;
    const montoRaw = rawText.match(/(?:Total|Monto)[:\s]+\$?\s*([\d.,]+)/i)?.[1] ?? null;
    const fechaRaw = rawText.match(/(?:Fecha)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i)?.[1] ?? null;
    const periodo = rawText.match(/(?:período|periodo|mes)[:\s]+([A-Za-záéíóúÁÉÍÓÚ]+\s+\d{4})/i)?.[1] ?? null;

    const fecha = fechaRaw ? parseDate(fechaRaw) : null;
    const monto = montoRaw ? normalizeMoney(montoRaw) : null;

    const fields: PDFExtractedField[] = [];
    addField(fields, "numero_oc", numeroOC, numeroOC ? "high" : "low");
    addField(fields, "rut_cliente", rut, rut ? "high" : "low");
    addField(fields, "fecha", fecha ?? (fechaRaw ?? null), fecha ? "high" : fechaRaw ? "medium" : "low");
    addField(fields, "monto_total", monto != null && !Number.isNaN(monto) ? String(monto) : montoRaw, monto != null && !Number.isNaN(monto) ? "high" : montoRaw ? "medium" : "low");
    addField(fields, "periodo", periodo, periodo ? "medium" : "low");

    return { fields, rawText };
  }
}
