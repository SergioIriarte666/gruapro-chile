import { z } from "zod";

const uuid = (message: string) => z.string().uuid(message);

const baseCostoSchema = z.object({
  fecha: z.string().min(1, "La fecha es obligatoria"),
  categoria_id: uuid("Selecciona una categoría"),
  subcategoria_id: uuid("Selecciona una subcategoría"),
  monto: z.coerce.number().min(0.01, "Ingresa el monto"),
  medio_pago: z.enum(["efectivo", "transferencia", "tarjeta", "cheque"]).optional(),
  tipo: z.enum(["servicio", "operacional"]),
  orden_id: uuid("Selecciona una orden").optional(),
  grua_id: uuid("ID de grúa inválido").optional(),
  proveedor_id: uuid("ID de proveedor inválido").optional(),
  numero_documento: z.string().trim().max(100).optional(),
  descripcion: z.string().trim().max(2000).optional(),
});

export const createCostoSchema = baseCostoSchema.superRefine((data, ctx) => {
  if (data.tipo === "servicio" && !data.orden_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Selecciona una orden",
      path: ["orden_id"],
    });
  }
});

export const editCostoSchema = baseCostoSchema
  .partial()
  .extend({ id: uuid("ID inválido") })
  .superRefine((data, ctx) => {
    if (data.tipo === "servicio" && !data.orden_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecciona una orden",
        path: ["orden_id"],
      });
    }
  });

export type CostoFormValues = z.input<typeof createCostoSchema>;
