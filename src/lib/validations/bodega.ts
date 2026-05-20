import { z } from "zod";

const uuid = (message: string) => z.string().uuid(message);

export const createItemSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(200),
  subcategoria_id: uuid("Subcategoría inválida").optional(),
  proveedor_id: uuid("Proveedor inválido").optional(),
  stock_minimo: z.coerce.number().min(0).default(0),
  precio_costo: z.coerce.number().min(0).default(0),
  unidad: z.string().trim().min(1).max(50).default("unidad"),
  ubicacion: z.string().trim().max(120).optional(),
});

export const editItemSchema = createItemSchema.partial().extend({
  id: uuid("ID inválido"),
});

export const createMovimientoSchema = z.object({
  item_id: uuid("Selecciona un ítem"),
  tipo: z.enum(["entrada", "salida", "ajuste"]),
  cantidad: z.coerce.number().min(0.01, "Ingresa una cantidad válida"),
  fecha: z.string().min(1, "La fecha es obligatoria"),
  grua_id: uuid("ID de grúa inválido").optional(),
  orden_id: uuid("ID de orden inválido").optional(),
  descripcion: z.string().trim().max(500).optional(),
});
