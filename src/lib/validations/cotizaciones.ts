import { z } from "zod";

const uuid = (message: string) => z.string().uuid(message);

const lineaSchema = z.object({
  descripcion: z.string().trim().min(1, "La descripción es obligatoria").max(500),
  cantidad: z.coerce.number().int().min(1, "Cantidad inválida"),
  precio_unitario: z.coerce.number().min(0, "Precio inválido"),
  descuento: z.coerce.number().min(0).max(100).optional(),
  orden_id: uuid("ID de orden inválido").optional(),
});

export const createCotizacionSchema = z.object({
  cliente_id: uuid("Selecciona un cliente"),
  fecha_vencimiento: z.string().min(1, "La fecha de vencimiento es obligatoria"),
  condicion_pago: z.coerce.number().min(0).default(0),
  iva_incluido: z.coerce.boolean().default(true),
  observaciones: z.string().trim().max(2000).optional(),
  lineas: z.array(lineaSchema).min(1, "Agrega al menos una línea"),
});

export const editCotizacionSchema = createCotizacionSchema.partial().extend({
  id: uuid("ID inválido"),
});

export const cambiarEstadoCotizacionSchema = z.object({
  estado: z.enum(["borrador", "enviada", "aprobada", "rechazada", "vencida", "facturada"]),
});

export type CotizacionFormValues = z.input<typeof createCotizacionSchema>;
