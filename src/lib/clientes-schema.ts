import { z } from "zod";

export const tipoClienteOptions = [
  { value: "persona", label: "Persona" },
  { value: "empresa", label: "Empresa" },
  { value: "aseguradora", label: "Aseguradora" },
] as const;

export const periodoCierreOptions = [
  { value: "mensual", label: "Mensual" },
  { value: "quincenal", label: "Quincenal" },
  { value: "semanal", label: "Semanal" },
] as const;

export const clienteSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(255),
  rut: z.string().trim().max(20).optional().or(z.literal("")),
  tipo: z.enum(["persona", "empresa", "aseguradora"], {
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
    .max(365, "Máximo 365 días"),
  requiere_folio: z.boolean(),
  periodo_cierre: z.enum(["mensual", "quincenal", "semanal"]),
  iva_incluido: z.boolean(),
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
  condicion_pago: 30,
  requiere_folio: false,
  periodo_cierre: "mensual",
  iva_incluido: true,
  observaciones: "",
};

export const vehiculoClienteSchema = z.object({
  vehiculo_catalogo_id: z.string().uuid("Selecciona un vehículo"),
  patente: z.string().trim().min(1, "La patente es obligatoria").max(20),
  color: z.string().trim().max(50).optional().or(z.literal("")),
  observaciones: z.string().trim().max(500).optional().or(z.literal("")),
});

export type VehiculoClienteFormValues = z.infer<typeof vehiculoClienteSchema>;
