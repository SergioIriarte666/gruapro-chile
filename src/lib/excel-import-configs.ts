import { supabase } from "@/integrations/supabase/client";

export type ColumnType = "string" | "number" | "date" | "boolean" | "enum";

export interface ColumnDef {
  key: string; // header in Excel
  required?: boolean;
  type: ColumnType;
  enumValues?: string[]; // for enum
  // Lookup: resolves a code (rut/patente/nombre) to an id from supabase
  lookup?: {
    table: string;
    matchField: string; // field to match against value
    idField?: string; // default "id"
  };
  example: string | number | boolean;
  description?: string;
}

export interface ImportConfig {
  module: string;
  label: string;
  table: string;
  conflictField?: string; // for upsert
  columns: ColumnDef[];
  // Build the row to insert from validated (typed/resolved) row
  buildRow: (row: Record<string, any>) => Record<string, any>;
  // Optional: load dynamic enum options from supabase (returns map of column key -> values)
  loadDynamicEnums?: () => Promise<Record<string, string[]>>;
}

const FORMA_PAGO = ["efectivo", "transferencia", "tarjeta", "credito", "convenio"];
const TIPO_SERVICIO = ["traslado", "auxilio", "remolque", "rescate", "siniestro", "otro"];
const ESTADO_ORDEN = ["pendiente", "asignado", "en_curso", "completado", "anulado"];
const MEDIO_PAGO = ["transferencia", "efectivo", "tarjeta", "cheque", "credito"];
const TIPO_COSTO = ["servicio", "operacional"];
const TIPO_CLIENTE = ["persona", "empresa", "aseguradora"];

export const IMPORT_CONFIGS: Record<string, ImportConfig> = {
  servicios: {
    module: "servicios",
    label: "Órdenes de servicio",
    table: "ordenes_servicio",
    columns: [
      { key: "cliente_rut", required: true, type: "string", example: "76.123.456-7",
        lookup: { table: "clientes", matchField: "rut" }, description: "RUT del cliente (debe existir)" },
      { key: "patente_vehiculo", type: "string", example: "ABCD12",
        lookup: { table: "clientes_vehiculos", matchField: "patente" }, description: "Patente del vehículo cliente" },
      { key: "tipo_servicio", required: true, type: "enum", enumValues: TIPO_SERVICIO, example: "traslado" },
      { key: "fecha_servicio", required: true, type: "date", example: "2026-05-18" },
      { key: "origen", type: "string", example: "Santiago Centro" },
      { key: "destino", type: "string", example: "Las Condes" },
      { key: "monto", required: true, type: "number", example: 45000 },
      { key: "forma_pago", type: "enum", enumValues: FORMA_PAGO, example: "transferencia" },
      { key: "estado", type: "enum", enumValues: ESTADO_ORDEN, example: "pendiente" },
      { key: "grua_patente", type: "string", example: "GR1234",
        lookup: { table: "gruas", matchField: "patente" } },
      { key: "operador_rut", type: "string", example: "11.111.111-1",
        lookup: { table: "operadores", matchField: "rut" } },
      { key: "folio_cliente", type: "string", example: "12345" },
      { key: "observaciones", type: "string", example: "" },
    ],
    buildRow: (r) => ({
      cliente_id: r.cliente_rut,
      cliente_vehiculo_id: r.patente_vehiculo ?? null,
      tipo_servicio: r.tipo_servicio,
      fecha_servicio: r.fecha_servicio,
      origen: r.origen ?? null,
      destino: r.destino ?? null,
      monto: r.monto,
      forma_pago: r.forma_pago ?? null,
      estado: r.estado ?? "pendiente",
      grua_id: r.grua_patente ?? null,
      operador_id: r.operador_rut ?? null,
      folio_cliente: r.folio_cliente ?? null,
      observaciones: r.observaciones ?? null,
    }),
  },
  costos: {
    module: "costos",
    label: "Costos",
    table: "costos",
    columns: [
      { key: "fecha", required: true, type: "date", example: "2026-05-18" },
      { key: "monto", required: true, type: "number", example: 25000 },
      { key: "tipo", required: true, type: "enum", enumValues: TIPO_COSTO, example: "operacional" },
      { key: "categoria_nombre", required: true, type: "string", example: "Combustible",
        lookup: { table: "categorias_costo", matchField: "nombre" } },
      { key: "subcategoria_nombre", type: "string", example: "Diesel",
        lookup: { table: "subcategorias_costo", matchField: "nombre" } },
      { key: "grua_patente", type: "string", example: "GR1234",
        lookup: { table: "gruas", matchField: "patente" } },
      { key: "proveedor_rut", type: "string", example: "77.000.000-0",
        lookup: { table: "proveedores", matchField: "rut" } },
      { key: "medio_pago", type: "enum", enumValues: MEDIO_PAGO, example: "transferencia" },
      { key: "numero_documento", type: "string", example: "F-0001" },
      { key: "descripcion", type: "string", example: "Carga combustible" },
    ],
    buildRow: (r) => ({
      fecha: r.fecha,
      monto: r.monto,
      tipo: r.tipo,
      categoria_id: r.categoria_nombre,
      subcategoria_id: r.subcategoria_nombre ?? null,
      grua_id: r.grua_patente ?? null,
      proveedor_id: r.proveedor_rut ?? null,
      medio_pago: r.medio_pago ?? null,
      numero_documento: r.numero_documento ?? null,
      descripcion: r.descripcion ?? null,
    }),
  },
  clientes: {
    module: "clientes",
    label: "Clientes",
    table: "clientes",
    conflictField: "rut",
    columns: [
      { key: "nombre", required: true, type: "string", example: "Transportes Acme SpA" },
      { key: "rut", required: true, type: "string", example: "76.123.456-7" },
      { key: "tipo", required: true, type: "enum", enumValues: TIPO_CLIENTE, example: "empresa" },
      { key: "telefono", type: "string", example: "+56 9 1234 5678" },
      { key: "email", type: "string", example: "contacto@acme.cl" },
      { key: "direccion", type: "string", example: "Av. Providencia 1234" },
      { key: "condicion_pago", type: "number", example: 30 },
      { key: "requiere_folio", type: "boolean", example: false },
      { key: "iva_incluido", type: "boolean", example: true },
    ],
    buildRow: (r) => ({
      nombre: r.nombre,
      rut: r.rut,
      tipo: r.tipo,
      telefono: r.telefono ?? null,
      email: r.email ?? null,
      direccion: r.direccion ?? null,
      condicion_pago: r.condicion_pago ?? 0,
      requiere_folio: r.requiere_folio ?? false,
      iva_incluido: r.iva_incluido ?? true,
    }),
  },
  bodega: {
    module: "bodega",
    label: "Bodega — Items",
    table: "bodega_items",
    columns: [
      { key: "nombre", required: true, type: "string", example: "Cable de acero 8mm" },
      { key: "unidad", type: "string", example: "unidad" },
      { key: "ubicacion", type: "string", example: "Bodega A — Estante 3" },
      { key: "precio_costo", type: "number", example: 12000 },
      { key: "stock_actual", type: "number", example: 10 },
      { key: "stock_minimo", type: "number", example: 2 },
      { key: "proveedor_rut", type: "string", example: "77.000.000-0",
        lookup: { table: "proveedores", matchField: "rut" } },
    ],
    buildRow: (r) => ({
      nombre: r.nombre,
      unidad: r.unidad ?? "unidad",
      ubicacion: r.ubicacion ?? null,
      precio_costo: r.precio_costo ?? 0,
      stock_actual: r.stock_actual ?? 0,
      stock_minimo: r.stock_minimo ?? 0,
      proveedor_id: r.proveedor_rut ?? null,
    }),
  },
};

export async function resolveLookup(
  col: ColumnDef,
  rawValue: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!col.lookup) return { ok: false, error: "no lookup" };
  const idField = col.lookup.idField ?? "id";
  const { data, error } = await supabase
    .from(col.lookup.table as any)
    .select(idField)
    .ilike(col.lookup.matchField, rawValue.trim())
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: `No existe ${col.lookup.matchField}="${rawValue}" en ${col.lookup.table}` };
  return { ok: true, id: (data as any)[idField] };
}
