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
