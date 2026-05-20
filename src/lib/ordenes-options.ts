export const TIPO_SERVICIO_OPTIONS = [
  { value: "remolque_local", label: "Remolque local" },
  { value: "larga_distancia", label: "Larga distancia" },
  { value: "izaje", label: "Izaje" },
  { value: "rescate", label: "Rescate" },
  { value: "traslado", label: "Traslado" },
] as const;

export const ESTADO_ORDEN_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_curso", label: "En curso" },
  { value: "completado", label: "Completado" },
  { value: "facturado", label: "Facturado" },
  { value: "anulado", label: "Anulado" },
] as const;

export const FORMA_PAGO_OPTIONS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "credito", label: "Cuenta corriente" },
  { value: "aseguradora", label: "Aseguradora" },
] as const;

export function estadoOrdenVariant(
  estado: string | null | undefined,
): "default" | "secondary" | "outline" | "destructive" {
  switch (estado) {
    case "completado":
      return "default";
    case "anulado":
      return "destructive";
    case "en_curso":
      return "secondary";
    case "facturado":
      return "secondary";
    default:
      return "outline";
  }
}
