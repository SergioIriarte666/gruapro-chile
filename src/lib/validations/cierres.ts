import { z } from "zod";

const uuid = (message: string) => z.string().uuid(message);

export const createCierreSchema = z
  .object({
    cliente_id: uuid("Selecciona un cliente"),
    periodo_inicio: z.string().min(1, "El período inicio es obligatorio"),
    periodo_fin: z.string().min(1, "El período fin es obligatorio"),
    observaciones: z.string().trim().max(2000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.periodo_fin < data.periodo_inicio) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "El período fin debe ser mayor o igual al inicio",
        path: ["periodo_fin"],
      });
    }
  });

export const registrarFolioSchema = z.object({
  folio_cliente: z.string().trim().min(1, "El folio del cliente es obligatorio").max(120),
  folio_fecha_recepcion: z.string().min(1, "La fecha de recepción es obligatoria"),
  folio_vencimiento: z.string().min(1, "La fecha de vencimiento es obligatoria"),
});

export const registrarFacturaSchema = z.object({
  factura_folio_sii: z.string().trim().min(1, "Ingresa el folio del SII").max(120),
  factura_fecha: z.string().min(1, "La fecha de factura es obligatoria"),
});

export const registrarPagoSchema = z.object({
  pago_fecha: z.string().min(1, "La fecha de pago es obligatoria"),
  pago_monto: z.coerce.number().min(0, "Ingresa un monto válido"),
  pago_medio: z.enum(["transferencia", "cheque", "efectivo"]),
  pago_referencia: z.string().trim().max(120).optional(),
});
