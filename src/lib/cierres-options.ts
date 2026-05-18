export const ESTADO_CIERRE_OPTIONS = [
  { value: "abierto", label: "Abierto" },
  { value: "enviado", label: "Enviado" },
  { value: "con_folio", label: "Con folio" },
  { value: "facturado", label: "Facturado" },
  { value: "pagado", label: "Pagado" },
  { value: "anulado", label: "Anulado" },
] as const;

export type EstadoCierre = (typeof ESTADO_CIERRE_OPTIONS)[number]["value"];

export function estadoCierreLabel(v: string | null | undefined) {
  return ESTADO_CIERRE_OPTIONS.find((o) => o.value === v)?.label ?? v ?? "—";
}

export function estadoCierreVariant(
  v: string | null | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  switch (v) {
    case "pagado":
      return "default";
    case "facturado":
      return "secondary";
    case "anulado":
      return "destructive";
    default:
      return "outline";
  }
}

export const MEDIO_PAGO_OPTIONS = [
  "transferencia",
  "cheque",
  "efectivo",
  "tarjeta",
  "otro",
] as const;

export function calcTotales(montoSum: number, ivaIncluido: boolean, ivaPct = 19) {
  const factor = 1 + ivaPct / 100;
  if (ivaIncluido) {
    const total = montoSum;
    const subtotal = Math.round(total / factor);
    const iva = total - subtotal;
    return { subtotal, iva, total };
  }
  const subtotal = montoSum;
  const iva = Math.round(subtotal * (ivaPct / 100));
  const total = subtotal + iva;
  return { subtotal, iva, total };
}
