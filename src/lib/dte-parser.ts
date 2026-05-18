import { XMLParser } from "fast-xml-parser";

export type Confidence = "ok" | "warn" | "missing";

export interface DteCampo<T = string | number | null> {
  valor: T;
  confianza: Confidence;
  nota?: string;
}

export interface DteExtraido {
  rut_emisor: DteCampo<string | null>;
  nombre_emisor: DteCampo<string | null>;
  giro_emisor: DteCampo<string | null>;
  folio: DteCampo<string | null>;
  fecha: DteCampo<string | null>; // ISO date
  monto_neto: DteCampo<number | null>;
  iva: DteCampo<number | null>;
  total: DteCampo<number | null>;
  tipo_dte: DteCampo<string | null>;
  categoria_sugerida: string | null;
}

const CATEGORIA_HINTS: Array<{ match: RegExp; categoria: string }> = [
  { match: /COPEC|PETROBRAS|SHELL|ENEX|YPF|TERPEL|ARAMCO/i, categoria: "Combustible" },
  { match: /TALLER|MEC[ÁA]NIC|REPUEST|LUBRICENT|NEUM[ÁA]TIC|VULCANIZ/i, categoria: "Mantención de flota" },
  { match: /SEGURO|ASEGURADORA|HDI|MAPFRE|CONSORCIO/i, categoria: "Seguros" },
  { match: /PEAJE|AUTOPISTA|COSTANERA|VESPUCIO/i, categoria: "Peajes" },
  { match: /TELEFON|MOVISTAR|ENTEL|CLARO|WOM/i, categoria: "Telecomunicaciones" },
  { match: /ELECTRIC|ENEL|CGE|SAESA|AGUAS|GAS/i, categoria: "Servicios básicos" },
];

function num(v: any): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v: any): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function campo<T>(valor: T, opts?: { warn?: boolean; nota?: string }): DteCampo<T> {
  if (valor === null || valor === undefined || valor === "") {
    return { valor: valor as T, confianza: "missing", nota: opts?.nota ?? "No encontrado en el XML" };
  }
  return { valor, confianza: opts?.warn ? "warn" : "ok", nota: opts?.nota };
}

export function parseDte(xmlText: string): DteExtraido {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseTagValue: true,
    trimValues: true,
  });
  const tree = parser.parse(xmlText);

  // Tolerar envolturas comunes: <EnvioDTE>/<SetDTE>/<DTE>/<Documento>/<Encabezado>
  // o directamente <DTE>/<Documento>/<Encabezado>
  function findEncabezado(node: any): any {
    if (!node || typeof node !== "object") return null;
    if (node.Encabezado) return node.Encabezado;
    for (const key of Object.keys(node)) {
      const child = (node as any)[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          const r = findEncabezado(c);
          if (r) return r;
        }
      } else if (typeof child === "object") {
        const r = findEncabezado(child);
        if (r) return r;
      }
    }
    return null;
  }

  const enc = findEncabezado(tree);
  const emisor = enc?.Emisor ?? {};
  const idDoc = enc?.IdDoc ?? {};
  const totales = enc?.Totales ?? {};

  const rut_emisor = str(emisor?.RUTEmisor);
  const nombre_emisor = str(emisor?.RznSoc ?? emisor?.RznSocEmisor);
  const giro_emisor = str(emisor?.GiroEmis ?? emisor?.GiroEmisor);
  const folio = str(idDoc?.Folio);
  const tipo_dte = str(idDoc?.TipoDTE);

  // Validar fecha YYYY-MM-DD
  const fechaRaw = str(idDoc?.FchEmis);
  const fechaOk = fechaRaw && /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw);

  const monto_neto = num(totales?.MntNeto);
  const iva = num(totales?.IVA);
  const total = num(totales?.MntTotal);

  // Consistencia: neto + iva ≈ total → ok, si no, warn
  let totalWarn = false;
  if (monto_neto !== null && iva !== null && total !== null) {
    if (Math.abs(monto_neto + iva - total) > 2) totalWarn = true;
  }

  // Sugerir categoría por nombre
  let categoria_sugerida: string | null = null;
  if (nombre_emisor) {
    for (const h of CATEGORIA_HINTS) {
      if (h.match.test(nombre_emisor)) {
        categoria_sugerida = h.categoria;
        break;
      }
    }
  }

  return {
    rut_emisor: campo(rut_emisor),
    nombre_emisor: campo(nombre_emisor),
    giro_emisor: campo(giro_emisor, { warn: !giro_emisor ? false : false }),
    folio: campo(folio),
    fecha: fechaOk
      ? campo(fechaRaw)
      : campo(fechaRaw, { warn: !!fechaRaw, nota: fechaRaw ? "Formato no estándar" : undefined }),
    monto_neto: campo(monto_neto),
    iva: campo(iva),
    total: campo(total, { warn: totalWarn, nota: totalWarn ? "Neto + IVA ≠ Total" : undefined }),
    tipo_dte: campo(tipo_dte),
    categoria_sugerida,
  };
}
