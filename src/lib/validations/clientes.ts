import { z } from "zod";

function cleanRut(input: string) {
  return input.replace(/\./g, "").replace(/-/g, "").trim().toUpperCase();
}

function isValidRut(rut: string) {
  const clean = cleanRut(rut);
  if (!/^\d{7,8}[0-9K]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  const expected = mod === 11 ? "0" : mod === 10 ? "K" : String(mod);
  return dv === expected;
}

export const createClienteSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(200),
  rut: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => {
        if (!v) return true;
        if (!/^\d{1,2}\.\d{3}\.\d{3}-[0-9kK]$/.test(v)) return false;
        return isValidRut(v);
      },
      { message: "RUT inválido. Formato esperado: 12.345.678-9" },
    ),
  tipo: z.enum(["persona_natural", "empresa", "aseguradora"]),
  email: z.string().trim().max(255).email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().trim().max(50).optional().or(z.literal("")),
  direccion: z.string().trim().max(500).optional().or(z.literal("")),
  condicion_pago: z.coerce.number().min(0, "No puede ser negativo").max(180, "Máximo 180 días").default(0),
  requiere_folio: z.boolean().default(false),
  periodo_cierre: z.enum(["mensual", "quincenal", "semanal"]).default("mensual"),
  iva_incluido: z.boolean().default(true),
  emails_cierre: z.array(z.string().email("Email inválido")).optional(),
  observaciones: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const editClienteSchema = createClienteSchema.partial().extend({
  id: z.string().uuid(),
});

