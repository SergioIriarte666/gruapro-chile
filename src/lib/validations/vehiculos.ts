import { z } from "zod";

export const VEHICULO_TIPO_OPTIONS = [
  "Auto",
  "Camioneta",
  "Furgón",
  "Bus / Minibus",
  "Camión",
  "Moto",
] as const;

export const VEHICULO_ESTADO_OPTIONS = ["activo", "inactivo"] as const;

export const createVehiculoSchema = z.object({
  marca: z.string().trim().min(1, "La marca es obligatoria").max(100),
  modelo: z.string().trim().min(1, "El modelo es obligatorio").max(100),
  anio: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().int().min(1980).max(2030).optional(),
  ),
  tipo: z.enum(VEHICULO_TIPO_OPTIONS, {
    errorMap: () => ({ message: "Debes seleccionar un tipo" }),
  }),
  combustible: z.string().trim().max(50).optional().or(z.literal("")),
  estado: z.enum(VEHICULO_ESTADO_OPTIONS).default("activo"),
});

export const createClienteVehiculoSchema = z.object({
  cliente_id: z.string().uuid(),
  vehiculo_catalogo_id: z.string().uuid("Selecciona un vehículo del catálogo"),
  patente: z.string().trim().max(8).optional().or(z.literal("")),
  color: z.string().trim().max(50).optional().or(z.literal("")),
  observaciones: z.string().trim().max(500).optional().or(z.literal("")),
});
