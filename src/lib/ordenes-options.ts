export const TIPO_SERVICIO_OPTIONS = [
  { value: "traslado", label: "Traslado" },
  { value: "auxilio", label: "Auxilio mecánico" },
  { value: "remolque", label: "Remolque" },
  { value: "rescate", label: "Rescate" },
  { value: "siniestro", label: "Siniestro" },
  { value: "otro", label: "Otro" },
] as const;

export const ESTADO_ORDEN_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "asignado", label: "Asignado" },
  { value: "en_curso", label: "En curso" },
  { value: "completado", label: "Completado" },
  { value: "anulado", label: "Anulado" },
] as const;

export const FORMA_PAGO_OPTIONS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "credito", label: "Cuenta corriente" },
  { value: "convenio", label: "Convenio" },
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
    case "asignado":
      return "secondary";
    default:
      return "outline";
  }
}
