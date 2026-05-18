export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bodega_items: {
        Row: {
          created_at: string | null
          id: string
          nombre: string
          precio_costo: number | null
          proveedor_id: string | null
          stock_actual: number | null
          stock_minimo: number | null
          subcategoria_id: string | null
          ubicacion: string | null
          unidad: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nombre: string
          precio_costo?: number | null
          proveedor_id?: string | null
          stock_actual?: number | null
          stock_minimo?: number | null
          subcategoria_id?: string | null
          ubicacion?: string | null
          unidad?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nombre?: string
          precio_costo?: number | null
          proveedor_id?: string | null
          stock_actual?: number | null
          stock_minimo?: number | null
          subcategoria_id?: string | null
          ubicacion?: string | null
          unidad?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodega_items_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_items_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_costo"
            referencedColumns: ["id"]
          },
        ]
      }
      bodega_movimientos: {
        Row: {
          cantidad: number
          created_at: string | null
          descripcion: string | null
          fecha: string | null
          grua_id: string | null
          id: string
          item_id: string
          orden_id: string | null
          tipo: string | null
        }
        Insert: {
          cantidad: number
          created_at?: string | null
          descripcion?: string | null
          fecha?: string | null
          grua_id?: string | null
          id?: string
          item_id: string
          orden_id?: string | null
          tipo?: string | null
        }
        Update: {
          cantidad?: number
          created_at?: string | null
          descripcion?: string | null
          fecha?: string | null
          grua_id?: string | null
          id?: string
          item_id?: string
          orden_id?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bodega_movimientos_grua_id_fkey"
            columns: ["grua_id"]
            isOneToOne: false
            referencedRelation: "gruas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_movimientos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "bodega_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bodega_movimientos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias_costo: {
        Row: {
          activa: boolean | null
          id: string
          nombre: string
          tipo: string | null
        }
        Insert: {
          activa?: boolean | null
          id?: string
          nombre: string
          tipo?: string | null
        }
        Update: {
          activa?: boolean | null
          id?: string
          nombre?: string
          tipo?: string | null
        }
        Relationships: []
      }
      cierre_servicios: {
        Row: {
          cierre_id: string
          id: string
          monto_aplicado: number | null
          orden_id: string
        }
        Insert: {
          cierre_id: string
          id?: string
          monto_aplicado?: number | null
          orden_id: string
        }
        Update: {
          cierre_id?: string
          id?: string
          monto_aplicado?: number | null
          orden_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cierre_servicios_cierre_id_fkey"
            columns: ["cierre_id"]
            isOneToOne: false
            referencedRelation: "cierres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cierre_servicios_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: true
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      cierres: {
        Row: {
          cliente_id: string
          created_at: string | null
          estado: string | null
          factura_fecha: string | null
          factura_folio_sii: string | null
          folio_cliente: string | null
          folio_fecha_recepcion: string | null
          folio_vencimiento: string | null
          id: string
          iva: number | null
          numero: string | null
          pago_fecha: string | null
          pago_medio: string | null
          pago_monto: number | null
          pago_referencia: string | null
          periodo_fin: string
          periodo_inicio: string
          subtotal: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          estado?: string | null
          factura_fecha?: string | null
          factura_folio_sii?: string | null
          folio_cliente?: string | null
          folio_fecha_recepcion?: string | null
          folio_vencimiento?: string | null
          id?: string
          iva?: number | null
          numero?: string | null
          pago_fecha?: string | null
          pago_medio?: string | null
          pago_monto?: number | null
          pago_referencia?: string | null
          periodo_fin: string
          periodo_inicio: string
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          estado?: string | null
          factura_fecha?: string | null
          factura_folio_sii?: string | null
          folio_cliente?: string | null
          folio_fecha_recepcion?: string | null
          folio_vencimiento?: string | null
          id?: string
          iva?: number | null
          numero?: string | null
          pago_fecha?: string | null
          pago_medio?: string | null
          pago_monto?: number | null
          pago_referencia?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          subtotal?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cierres_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          condicion_pago: number | null
          created_at: string | null
          direccion: string | null
          email: string | null
          emails_cierre: string[] | null
          id: string
          iva_incluido: boolean | null
          nombre: string
          observaciones: string | null
          periodo_cierre: string | null
          requiere_folio: boolean | null
          rut: string | null
          telefono: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          condicion_pago?: number | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          emails_cierre?: string[] | null
          id?: string
          iva_incluido?: boolean | null
          nombre: string
          observaciones?: string | null
          periodo_cierre?: string | null
          requiere_folio?: boolean | null
          rut?: string | null
          telefono?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          condicion_pago?: number | null
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          emails_cierre?: string[] | null
          id?: string
          iva_incluido?: boolean | null
          nombre?: string
          observaciones?: string | null
          periodo_cierre?: string | null
          requiere_folio?: boolean | null
          rut?: string | null
          telefono?: string | null
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      clientes_vehiculos: {
        Row: {
          cliente_id: string
          color: string | null
          created_at: string | null
          id: string
          observaciones: string | null
          patente: string | null
          vehiculo_catalogo_id: string
        }
        Insert: {
          cliente_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          observaciones?: string | null
          patente?: string | null
          vehiculo_catalogo_id: string
        }
        Update: {
          cliente_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          observaciones?: string | null
          patente?: string | null
          vehiculo_catalogo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_vehiculos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_vehiculos_vehiculo_catalogo_id_fkey"
            columns: ["vehiculo_catalogo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      comisiones: {
        Row: {
          created_at: string | null
          estado: string | null
          fecha_pago: string | null
          id: string
          monto_comision: number
          operador_id: string
          orden_id: string
        }
        Insert: {
          created_at?: string | null
          estado?: string | null
          fecha_pago?: string | null
          id?: string
          monto_comision: number
          operador_id: string
          orden_id: string
        }
        Update: {
          created_at?: string | null
          estado?: string | null
          fecha_pago?: string | null
          id?: string
          monto_comision?: number
          operador_id?: string
          orden_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comisiones_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: true
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      config_comisiones: {
        Row: {
          id: string
          monto_comision: number | null
          tipo_servicio: string
        }
        Insert: {
          id?: string
          monto_comision?: number | null
          tipo_servicio: string
        }
        Update: {
          id?: string
          monto_comision?: number | null
          tipo_servicio?: string
        }
        Relationships: []
      }
      config_empresa: {
        Row: {
          created_at: string | null
          direccion: string | null
          email: string | null
          folio_contador: number | null
          folio_digitos: number | null
          folio_incluir_anio: boolean | null
          folio_prefijo: string | null
          id: string
          iva_porcentaje: number | null
          logo_url: string | null
          nombre: string
          rut: string | null
          telefono: string | null
        }
        Insert: {
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          folio_contador?: number | null
          folio_digitos?: number | null
          folio_incluir_anio?: boolean | null
          folio_prefijo?: string | null
          id?: string
          iva_porcentaje?: number | null
          logo_url?: string | null
          nombre: string
          rut?: string | null
          telefono?: string | null
        }
        Update: {
          created_at?: string | null
          direccion?: string | null
          email?: string | null
          folio_contador?: number | null
          folio_digitos?: number | null
          folio_incluir_anio?: boolean | null
          folio_prefijo?: string | null
          id?: string
          iva_porcentaje?: number | null
          logo_url?: string | null
          nombre?: string
          rut?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      costos: {
        Row: {
          archivo_url: string | null
          categoria_id: string | null
          created_at: string | null
          descripcion: string | null
          fecha: string
          grua_id: string | null
          id: string
          medio_pago: string | null
          monto: number
          numero_documento: string | null
          orden_id: string | null
          proveedor_id: string | null
          subcategoria_id: string | null
          tipo: string | null
        }
        Insert: {
          archivo_url?: string | null
          categoria_id?: string | null
          created_at?: string | null
          descripcion?: string | null
          fecha?: string
          grua_id?: string | null
          id?: string
          medio_pago?: string | null
          monto: number
          numero_documento?: string | null
          orden_id?: string | null
          proveedor_id?: string | null
          subcategoria_id?: string | null
          tipo?: string | null
        }
        Update: {
          archivo_url?: string | null
          categoria_id?: string | null
          created_at?: string | null
          descripcion?: string | null
          fecha?: string
          grua_id?: string | null
          id?: string
          medio_pago?: string | null
          monto?: number
          numero_documento?: string | null
          orden_id?: string | null
          proveedor_id?: string | null
          subcategoria_id?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_costo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_grua_id_fkey"
            columns: ["grua_id"]
            isOneToOne: false
            referencedRelation: "gruas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "subcategorias_costo"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizacion_lineas: {
        Row: {
          cantidad: number | null
          cotizacion_id: string
          descripcion: string
          descuento: number | null
          id: string
          orden_id: string | null
          precio_unitario: number | null
          total_linea: number | null
        }
        Insert: {
          cantidad?: number | null
          cotizacion_id: string
          descripcion: string
          descuento?: number | null
          id?: string
          orden_id?: string | null
          precio_unitario?: number | null
          total_linea?: number | null
        }
        Update: {
          cantidad?: number | null
          cotizacion_id?: string
          descripcion?: string
          descuento?: number | null
          id?: string
          orden_id?: string | null
          precio_unitario?: number | null
          total_linea?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_lineas_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_orden_id_fkey"
            columns: ["orden_id"]
            isOneToOne: false
            referencedRelation: "ordenes_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          cliente_id: string
          condicion_pago: number | null
          created_at: string | null
          estado: string | null
          fecha_emision: string | null
          fecha_vencimiento: string | null
          id: string
          iva: number | null
          iva_incluido: boolean | null
          numero: string | null
          observaciones: string | null
          subtotal: number | null
          total: number | null
        }
        Insert: {
          cliente_id: string
          condicion_pago?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva?: number | null
          iva_incluido?: boolean | null
          numero?: string | null
          observaciones?: string | null
          subtotal?: number | null
          total?: number | null
        }
        Update: {
          cliente_id?: string
          condicion_pago?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_vencimiento?: string | null
          id?: string
          iva?: number | null
          iva_incluido?: boolean | null
          numero?: string | null
          observaciones?: string | null
          subtotal?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      gruas: {
        Row: {
          anio: number | null
          created_at: string | null
          estado: string | null
          fecha_incorporacion: string | null
          foto_url: string | null
          id: string
          marca: string | null
          modelo: string | null
          patente: string
          tipo_grua: string | null
          updated_at: string | null
        }
        Insert: {
          anio?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_incorporacion?: string | null
          foto_url?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          patente: string
          tipo_grua?: string | null
          updated_at?: string | null
        }
        Update: {
          anio?: number | null
          created_at?: string | null
          estado?: string | null
          fecha_incorporacion?: string | null
          foto_url?: string | null
          id?: string
          marca?: string | null
          modelo?: string | null
          patente?: string
          tipo_grua?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      operadores: {
        Row: {
          created_at: string | null
          estado: string | null
          id: string
          licencia_clase: string | null
          licencia_vencimiento: string | null
          nombre: string
          rut: string | null
          sueldo_base: number | null
          telefono: string | null
          tipo_contrato: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          estado?: string | null
          id?: string
          licencia_clase?: string | null
          licencia_vencimiento?: string | null
          nombre: string
          rut?: string | null
          sueldo_base?: number | null
          telefono?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          estado?: string | null
          id?: string
          licencia_clase?: string | null
          licencia_vencimiento?: string | null
          nombre?: string
          rut?: string | null
          sueldo_base?: number | null
          telefono?: string | null
          tipo_contrato?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ordenes_compra: {
        Row: {
          archivo_pdf_url: string | null
          cliente_id: string
          cotizacion_id: string | null
          created_at: string | null
          estado: string | null
          fecha_recepcion: string | null
          id: string
          monto_ejecutado: number | null
          monto_total: number | null
          numero_cliente: string | null
          numero_interno: string | null
        }
        Insert: {
          archivo_pdf_url?: string | null
          cliente_id: string
          cotizacion_id?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_recepcion?: string | null
          id?: string
          monto_ejecutado?: number | null
          monto_total?: number | null
          numero_cliente?: string | null
          numero_interno?: string | null
        }
        Update: {
          archivo_pdf_url?: string | null
          cliente_id?: string
          cotizacion_id?: string | null
          created_at?: string | null
          estado?: string | null
          fecha_recepcion?: string | null
          id?: string
          monto_ejecutado?: number | null
          monto_total?: number | null
          numero_cliente?: string | null
          numero_interno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_compra_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_compra_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      ordenes_servicio: {
        Row: {
          cliente_id: string
          cliente_vehiculo_id: string | null
          created_at: string | null
          destino: string | null
          estado: string | null
          fecha_servicio: string | null
          folio_cliente: string | null
          folio_interno: string | null
          folio_siniestro: string | null
          forma_pago: string | null
          fotos: string[] | null
          grua_id: string | null
          id: string
          monto: number | null
          observaciones: string | null
          operador_id: string | null
          origen: string | null
          tipo_servicio: string | null
          updated_at: string | null
        }
        Insert: {
          cliente_id: string
          cliente_vehiculo_id?: string | null
          created_at?: string | null
          destino?: string | null
          estado?: string | null
          fecha_servicio?: string | null
          folio_cliente?: string | null
          folio_interno?: string | null
          folio_siniestro?: string | null
          forma_pago?: string | null
          fotos?: string[] | null
          grua_id?: string | null
          id?: string
          monto?: number | null
          observaciones?: string | null
          operador_id?: string | null
          origen?: string | null
          tipo_servicio?: string | null
          updated_at?: string | null
        }
        Update: {
          cliente_id?: string
          cliente_vehiculo_id?: string | null
          created_at?: string | null
          destino?: string | null
          estado?: string | null
          fecha_servicio?: string | null
          folio_cliente?: string | null
          folio_interno?: string | null
          folio_siniestro?: string | null
          forma_pago?: string | null
          fotos?: string[] | null
          grua_id?: string | null
          id?: string
          monto?: number | null
          observaciones?: string | null
          operador_id?: string | null
          origen?: string | null
          tipo_servicio?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordenes_servicio_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_cliente_vehiculo_id_fkey"
            columns: ["cliente_vehiculo_id"]
            isOneToOne: false
            referencedRelation: "clientes_vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_grua_id_fkey"
            columns: ["grua_id"]
            isOneToOne: false
            referencedRelation: "gruas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordenes_servicio_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "operadores"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          created_at: string | null
          email: string | null
          giro: string | null
          id: string
          nombre: string
          rut: string | null
          telefono: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          giro?: string | null
          id?: string
          nombre: string
          rut?: string | null
          telefono?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          giro?: string | null
          id?: string
          nombre?: string
          rut?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      subcategorias_costo: {
        Row: {
          activa: boolean | null
          aplica_a: string | null
          categoria_id: string
          id: string
          nombre: string
        }
        Insert: {
          activa?: boolean | null
          aplica_a?: string | null
          categoria_id: string
          id?: string
          nombre: string
        }
        Update: {
          activa?: boolean | null
          aplica_a?: string | null
          categoria_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategorias_costo_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_costo"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehiculos_catalogo: {
        Row: {
          anio: number | null
          combustible: string | null
          created_at: string | null
          estado: string | null
          id: string
          marca: string
          modelo: string
          tipo: string | null
        }
        Insert: {
          anio?: number | null
          combustible?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          marca: string
          modelo: string
          tipo?: string | null
        }
        Update: {
          anio?: number | null
          combustible?: string | null
          created_at?: string | null
          estado?: string | null
          id?: string
          marca?: string
          modelo?: string
          tipo?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      genera_folio: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_authenticated: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "operador" | "contador"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "operador", "contador"],
    },
  },
} as const
