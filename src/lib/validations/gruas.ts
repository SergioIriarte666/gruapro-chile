import { z } from "zod";

export const TIPO_GRUA_OPTIONS = [
  "plataforma",
  "pluma",
  "portacontenedor",
  "otro",
] as const;

export const ESTADO_GRUA_OPTIONS = ["activa", "en_mantencion", "baja"] as const;

export const createGruaSchema = z.object({
  patente: z
    .string()
    .trim()
    .min(6, "La patente es obligatoria")
    .max(8, "Máximo 8 caracteres")
    .transform((v) => v.toUpperCase()),
  marca: z.string().trim().max(100).optional().or(z.literal("")),
  modelo: z.string().trim().max(100).optional().or(z.literal("")),
  anio: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().int().min(1990).max(2030).optional(),
  ),
  tipo_grua: z.enum(TIPO_GRUA_OPTIONS, {
    errorMap: () => ({ message: "Debes seleccionar un tipo de grúa" }),
  }),
  estado: z.enum(ESTADO_GRUA_OPTIONS).default("activa"),
  fecha_incorporacion: z.string().trim().optional().or(z.literal("")),
});

