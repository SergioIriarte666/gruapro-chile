import { z } from "zod";

const uuid = (message: string) => z.string().uuid(message);

export const createOCSchema = z.object({
  cliente_id: uuid("Selecciona un cliente"),
  numero_cliente: z.string().trim().max(100).optional(),
  cotizacion_id: uuid("Cotización inválida").optional(),
  fecha_recepcion: z.string().min(1, "La fecha de recepción es obligatoria"),
  monto_total: z.coerce.number().min(0, "Ingresa un monto válido"),
});

export const editOCSchema = createOCSchema.partial().extend({
  id: uuid("ID inválido"),
});

export const cambiarEstadoOCSchema = z.object({
  estado: z.enum([
    "recibida",
    "en_ejecucion",
    "parcialmente_facturada",
    "facturada",
    "anulada",
  ]),
});

export type OCFormValues = z.input<typeof createOCSchema>;
