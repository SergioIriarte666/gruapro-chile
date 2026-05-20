import type { Tables } from "@/integrations/supabase/types";

export type Cliente = Tables<"clientes">;

export type ClienteCreate = Omit<Cliente, "id" | "created_at" | "updated_at">;

export type ClienteEdit = Partial<ClienteCreate> & { id: string };

export type ClienteConVehiculos = Cliente & {
  clientes_vehiculos: Array<
    Tables<"clientes_vehiculos"> & {
      vehiculos_catalogo: Tables<"vehiculos_catalogo"> | null;
    }
  >;
};

export type ClienteListItem = Pick<
  Cliente,
  "id" | "nombre" | "rut" | "tipo" | "telefono" | "condicion_pago" | "requiere_folio"
>;

export type VehiculoCatalogo = Tables<"vehiculos_catalogo">;

export type VehiculoCatalogoCreate = Omit<VehiculoCatalogo, "id" | "created_at">;

export type ClienteVehiculo = Pick<
  Tables<"clientes_vehiculos">,
  "id" | "cliente_id" | "vehiculo_catalogo_id" | "patente" | "color" | "observaciones"
>;

export type ClienteVehiculoConCatalogo = ClienteVehiculo & {
  vehiculos_catalogo: Pick<
    Tables<"vehiculos_catalogo">,
    "id" | "marca" | "modelo" | "anio" | "tipo"
  > | null;
};

export type VehiculoSelectOption = Pick<
  Tables<"vehiculos_catalogo">,
  "id" | "marca" | "modelo" | "anio" | "tipo"
> & {
  display: string;
};

export type Grua = Tables<"gruas">;

export type GruaCreate = Omit<Grua, "id" | "created_at" | "updated_at">;

export type GruaEdit = Partial<GruaCreate> & { id: string };

export type GruaListItem = Pick<
  Grua,
  "id" | "patente" | "marca" | "modelo" | "anio" | "tipo_grua" | "estado" | "foto_url"
>;

export type GruaConEstadisticas = Grua & {
  totalServicios: number;
  totalCostos: number;
  proximaMantencion: string | null;
};

export type Operador = Tables<"operadores">;

export type OperadorCreate = Omit<Operador, "id" | "created_at" | "updated_at">;

export type OperadorEdit = Partial<OperadorCreate> & { id: string };

export type OperadorListItem = Pick<
  Operador,
  "id" | "nombre" | "rut" | "telefono" | "licencia_clase" | "licencia_vencimiento" | "estado"
>;

export type Comision = Pick<
  Tables<"comisiones">,
  "id" | "orden_id" | "operador_id" | "monto_comision" | "estado" | "fecha_pago"
> & { created_at?: string | null };

export type ComisionConDetalle = Comision & {
  ordenes_servicio: Pick<
    Tables<"ordenes_servicio">,
    "id" | "folio_interno" | "tipo_servicio" | "fecha_servicio"
  > | null;
};

export type ConfigComision = Pick<
  Tables<"config_comisiones">,
  "id" | "tipo_servicio" | "monto_comision"
>;

export type CategoriaCosto = Tables<"categorias_costo">;

export type SubcategoriaCosto = Tables<"subcategorias_costo">;

export type Proveedor = Tables<"proveedores">;

export type Costo = Tables<"costos">;

export type CostoCreate = Omit<Costo, "id" | "created_at">;

export type CostoEdit = Partial<CostoCreate> & { id: string };

export type CostoConDetalle = Costo & {
  categorias_costo: Pick<Tables<"categorias_costo">, "id" | "nombre"> | null;
  subcategorias_costo: Pick<Tables<"subcategorias_costo">, "id" | "nombre"> | null;
  proveedores: Pick<Tables<"proveedores">, "id" | "nombre"> | null;
  gruas: Pick<Tables<"gruas">, "id" | "patente"> | null;
  ordenes_servicio: Pick<Tables<"ordenes_servicio">, "id" | "folio_interno"> | null;
};

export type ResumenCostosPorCategoria = {
  categoria: string;
  total: number;
  porcentaje: number;
};

export type BodegaItem = Tables<"bodega_items">;

export type BodegaItemCreate = Omit<BodegaItem, "id" | "created_at" | "stock_actual">;

export type BodegaItemEdit = Partial<BodegaItemCreate> & { id: string };

export type BodegaItemConAlerta = BodegaItem & {
  bajoStock: boolean;
  proveedores: Pick<Tables<"proveedores">, "id" | "nombre"> | null;
};

export type BodegaMovimiento = Tables<"bodega_movimientos">;

export type BodegaMovimientoConDetalle = BodegaMovimiento & {
  bodega_items: Pick<Tables<"bodega_items">, "id" | "nombre"> | null;
  ordenes_servicio: Pick<Tables<"ordenes_servicio">, "id" | "folio_interno"> | null;
  gruas: Pick<Tables<"gruas">, "id" | "patente"> | null;
};

export type Cotizacion = Tables<"cotizaciones">;

export type CotizacionCreate = Omit<
  Cotizacion,
  "id" | "numero" | "created_at" | "subtotal" | "iva" | "total"
>;

export type CotizacionEdit = Partial<CotizacionCreate> & { id: string };

export type CotizacionLinea = Tables<"cotizacion_lineas">;

export type CotizacionLineaCreate = Omit<CotizacionLinea, "id" | "cotizacion_id" | "total_linea">;

export type CotizacionConLineas = Cotizacion & {
  clientes: Pick<Tables<"clientes">, "id" | "nombre" | "rut"> | null;
  cotizacion_lineas: Array<
    CotizacionLinea & {
      ordenes_servicio: Pick<Tables<"ordenes_servicio">, "id" | "folio_interno"> | null;
    }
  >;
};

export type OrdenCompra = Tables<"ordenes_compra">;

export type OrdenCompraCreate = Omit<
  OrdenCompra,
  "id" | "numero_interno" | "created_at" | "monto_ejecutado"
>;

export type OrdenCompraEdit = Partial<OrdenCompraCreate> & { id: string };

export type OrdenCompraConDetalle = OrdenCompra & {
  clientes: Pick<Tables<"clientes">, "id" | "nombre"> | null;
  cotizaciones: Pick<Tables<"cotizaciones">, "id" | "numero"> | null;
};

export type Cierre = Tables<"cierres">;

export type CierreCreate = Omit<
  Cierre,
  | "id"
  | "numero"
  | "created_at"
  | "updated_at"
  | "subtotal"
  | "iva"
  | "total"
  | "estado"
  | "factura_folio_sii"
  | "factura_fecha"
  | "pago_fecha"
  | "pago_monto"
  | "pago_medio"
  | "pago_referencia"
>;

export type CierreEdit = Partial<CierreCreate> & { id: string };

export type CierreServicio = Tables<"cierre_servicios">;

export type CierreServicioConOrden = CierreServicio & {
  ordenes_servicio: Tables<"ordenes_servicio"> | null;
};

export type CierreConDetalle = Cierre & {
  clientes: Pick<Tables<"clientes">, "id" | "nombre" | "rut" | "requiere_folio" | "iva_incluido"> | null;
  cierre_servicios: Array<
    CierreServicio & {
      ordenes_servicio: Pick<
        Tables<"ordenes_servicio">,
        | "id"
        | "folio_interno"
        | "folio_cliente"
        | "folio_siniestro"
        | "tipo_servicio"
        | "monto"
        | "fecha_servicio"
      > & {
        clientes_vehiculos:
          | (Pick<Tables<"clientes_vehiculos">, "patente"> & {
              vehiculos_catalogo: Pick<Tables<"vehiculos_catalogo">, "marca" | "modelo"> | null;
            })
          | null;
        operadores: Pick<Tables<"operadores">, "nombre"> | null;
      };
    }
  >;
};

export type LiquidacionCierre = {
  folioSii: string;
  fechaFactura: string;
};

export type PagoCierre = {
  fecha: string;
  monto: number;
  medio: "transferencia" | "cheque" | "efectivo";
  referencia?: string;
};

export type LiquidacionOperador = {
  operadorId: string;
  operadorNombre: string;
  periodo: string;
  servicios: number;
  totalComisiones: number;
  estado: "pendiente" | "pagado";
};
