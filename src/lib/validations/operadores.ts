import { z } from "zod";

const LICENCIA_OPTIONS = ["A1", "A2", "A3", "A4", "A5"] as const;
const CONTRATO_OPTIONS = ["planta", "honorarios", "externo"] as const;
const ESTADO_OPTIONS = ["activo", "inactivo", "vacaciones"] as const;

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

export const createOperadorSchema = z.object({
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
  telefono: z.string().trim().max(50).optional().or(z.literal("")),
  licencia_clase: z.enum(LICENCIA_OPTIONS).optional(),
  licencia_vencimiento: z.string().trim().optional().or(z.literal("")),
  tipo_contrato: z.enum(CONTRATO_OPTIONS, {
    errorMap: () => ({ message: "Debes seleccionar un tipo de contrato" }),
  }),
  sueldo_base: z.preprocess(
    (v) => (v === "" || v == null ? 0 : Number(v)),
    z.number().min(0, "No puede ser negativo").default(0),
  ),
  estado: z.enum(ESTADO_OPTIONS).default("activo"),
});

