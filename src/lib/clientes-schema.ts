import { z } from "zod";

export const tipoClienteOptions = [
  { value: "persona_natural", label: "Persona natural" },
  { value: "empresa", label: "Empresa" },
  { value: "aseguradora", label: "Aseguradora" },
] as const;

export const periodoCierreOptions = [
  { value: "mensual", label: "Mensual" },
  { value: "quincenal", label: "Quincenal" },
  { value: "semanal", label: "Semanal" },
] as const;

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

export function parseEmailsCierre(raw: string) {
  return raw
    .split(/[\n,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const clienteSchema = z.object({
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
  tipo: z.enum(["persona_natural", "empresa", "aseguradora"], {
    errorMap: () => ({ message: "Debes seleccionar un tipo" }),
  }),
  email: z
    .string()
    .trim()
    .max(255)
    .email("Email inválido")
    .optional()
    .or(z.literal("")),
  telefono: z.string().trim().max(50).optional().or(z.literal("")),
  direccion: z.string().trim().max(500).optional().or(z.literal("")),
  condicion_pago: z.coerce
    .number({ invalid_type_error: "Debe ser un número" })
    .int("Debe ser un número entero")
    .min(0, "No puede ser negativo")
    .max(180, "Máximo 180 días"),
  requiere_folio: z.boolean(),
  periodo_cierre: z.enum(["mensual", "quincenal", "semanal"]),
  iva_incluido: z.boolean(),
  emails_cierre: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .refine(
      (raw) => {
        const emails = parseEmailsCierre(raw ?? "");
        return emails.every((e) => z.string().email().safeParse(e).success);
      },
      { message: "Emails inválidos. Usa uno por línea o separados por coma." },
    ),
  observaciones: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ClienteFormValues = z.infer<typeof clienteSchema>;

export const defaultClienteValues: ClienteFormValues = {
  nombre: "",
  rut: "",
  tipo: "empresa",
  email: "",
  telefono: "",
  direccion: "",
  condicion_pago: 0,
  requiere_folio: false,
  periodo_cierre: "mensual",
  iva_incluido: true,
  emails_cierre: "",
  observaciones: "",
};

export const vehiculoClienteSchema = z.object({
  vehiculo_catalogo_id: z.string().uuid("Selecciona un vehículo"),
  patente: z.string().trim().min(1, "La patente es obligatoria").max(20),
  color: z.string().trim().max(50).optional().or(z.literal("")),
  observaciones: z.string().trim().max(500).optional().or(z.literal("")),
});

export type VehiculoClienteFormValues = z.infer<typeof vehiculoClienteSchema>;
