
-- EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- ROLES Y SEGURIDAD
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'operador', 'contador');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT auth.uid() IS NOT NULL
$$;

-- Trigger genérico updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Políticas user_roles
CREATE POLICY "Usuarios ven sus propios roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Solo admin gestiona roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- CONFIGURACIÓN EMPRESA
-- =========================================================
CREATE TABLE public.config_empresa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  rut TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  logo_url TEXT,
  folio_prefijo TEXT DEFAULT 'OS',
  folio_incluir_anio BOOLEAN DEFAULT true,
  folio_digitos INTEGER DEFAULT 4,
  folio_contador INTEGER DEFAULT 0,
  iva_porcentaje NUMERIC DEFAULT 19,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.config_empresa ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- CATÁLOGO DE VEHÍCULOS
-- =========================================================
CREATE TABLE public.vehiculos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marca TEXT NOT NULL,
  modelo TEXT NOT NULL,
  anio INTEGER,
  tipo TEXT CHECK (tipo IN ('Auto','Camioneta','Furgón','Bus / Minibus','Camión','Moto')),
  combustible TEXT,
  estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.vehiculos_catalogo ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- CLIENTES
-- =========================================================
CREATE TABLE public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('persona_natural','empresa','aseguradora')),
  email TEXT,
  telefono TEXT,
  direccion TEXT,
  condicion_pago INTEGER DEFAULT 0,
  requiere_folio BOOLEAN DEFAULT false,
  periodo_cierre TEXT DEFAULT 'mensual',
  emails_cierre TEXT[],
  iva_incluido BOOLEAN DEFAULT true,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clientes_updated BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- VEHÍCULOS POR CLIENTE
-- =========================================================
CREATE TABLE public.clientes_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  vehiculo_catalogo_id UUID NOT NULL REFERENCES public.vehiculos_catalogo(id),
  patente TEXT,
  color TEXT,
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.clientes_vehiculos ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- OPERADORES
-- =========================================================
CREATE TABLE public.operadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT UNIQUE,
  nombre TEXT NOT NULL,
  telefono TEXT,
  licencia_clase TEXT,
  licencia_vencimiento DATE,
  tipo_contrato TEXT CHECK (tipo_contrato IN ('planta','honorarios','externo')),
  sueldo_base NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo','inactivo','vacaciones')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.operadores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_operadores_updated BEFORE UPDATE ON public.operadores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- GRÚAS
-- =========================================================
CREATE TABLE public.gruas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patente TEXT UNIQUE NOT NULL,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  tipo_grua TEXT CHECK (tipo_grua IN ('plataforma','pluma','portacontenedor','otro')),
  estado TEXT DEFAULT 'activa' CHECK (estado IN ('activa','en_mantencion','baja')),
  foto_url TEXT,
  fecha_incorporacion DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.gruas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_gruas_updated BEFORE UPDATE ON public.gruas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- FOLIO AUTOMÁTICO
-- =========================================================
CREATE OR REPLACE FUNCTION public.genera_folio()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config public.config_empresa%ROWTYPE;
  nuevo_contador INTEGER;
  folio TEXT;
BEGIN
  SELECT * INTO config FROM public.config_empresa LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe configuración de empresa. Cree un registro en config_empresa.';
  END IF;
  nuevo_contador := config.folio_contador + 1;
  UPDATE public.config_empresa SET folio_contador = nuevo_contador WHERE id = config.id;
  IF config.folio_incluir_anio THEN
    folio := config.folio_prefijo || '-' || EXTRACT(YEAR FROM NOW())::TEXT
             || '-' || LPAD(nuevo_contador::TEXT, config.folio_digitos, '0');
  ELSE
    folio := config.folio_prefijo || '-' || LPAD(nuevo_contador::TEXT, config.folio_digitos, '0');
  END IF;
  RETURN folio;
END;
$$;

-- =========================================================
-- ÓRDENES DE SERVICIO
-- =========================================================
CREATE TABLE public.ordenes_servicio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folio_interno TEXT UNIQUE,
  folio_cliente TEXT,
  folio_siniestro TEXT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  cliente_vehiculo_id UUID REFERENCES public.clientes_vehiculos(id),
  grua_id UUID REFERENCES public.gruas(id),
  operador_id UUID REFERENCES public.operadores(id),
  tipo_servicio TEXT CHECK (tipo_servicio IN (
    'remolque_local','larga_distancia','izaje','rescate','traslado')),
  origen TEXT,
  destino TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente','en_curso','completado','facturado','anulado')),
  monto NUMERIC DEFAULT 0,
  forma_pago TEXT CHECK (forma_pago IN (
    'efectivo','transferencia','credito','aseguradora')),
  fecha_servicio TIMESTAMPTZ DEFAULT NOW(),
  observaciones TEXT,
  fotos TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ordenes_servicio ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ordenes_updated BEFORE UPDATE ON public.ordenes_servicio
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger folio automático al insertar
CREATE OR REPLACE FUNCTION public.trigger_folio_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.folio_interno IS NULL THEN
    NEW.folio_interno := public.genera_folio();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER set_folio_orden BEFORE INSERT ON public.ordenes_servicio
  FOR EACH ROW EXECUTE FUNCTION public.trigger_folio_orden();

-- Folio interno no editable después de creado
CREATE OR REPLACE FUNCTION public.proteger_folio_orden()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.folio_interno IS DISTINCT FROM NEW.folio_interno THEN
    RAISE EXCEPTION 'El folio interno no puede modificarse';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER proteger_folio_orden BEFORE UPDATE ON public.ordenes_servicio
  FOR EACH ROW EXECUTE FUNCTION public.proteger_folio_orden();

-- =========================================================
-- CONFIG COMISIONES + COMISIONES
-- =========================================================
CREATE TABLE public.config_comisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_servicio TEXT UNIQUE NOT NULL,
  monto_comision NUMERIC DEFAULT 0
);
ALTER TABLE public.config_comisiones ENABLE ROW LEVEL SECURITY;

INSERT INTO public.config_comisiones (tipo_servicio, monto_comision) VALUES
  ('remolque_local',8000),('larga_distancia',15000),
  ('izaje',12000),('rescate',10000),('traslado',7000);

CREATE TABLE public.comisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID UNIQUE NOT NULL REFERENCES public.ordenes_servicio(id),
  operador_id UUID NOT NULL REFERENCES public.operadores(id),
  monto_comision NUMERIC NOT NULL,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','descontado')),
  fecha_pago DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.comisiones ENABLE ROW LEVEL SECURITY;

-- Comisión pagada inmutable
CREATE OR REPLACE FUNCTION public.proteger_comision_pagada()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pagado' THEN
    RAISE EXCEPTION 'No se puede modificar una comisión ya pagada';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.estado = 'pagado' THEN
    RAISE EXCEPTION 'No se puede eliminar una comisión ya pagada';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
CREATE TRIGGER proteger_comision_pagada
  BEFORE UPDATE OR DELETE ON public.comisiones
  FOR EACH ROW EXECUTE FUNCTION public.proteger_comision_pagada();

-- =========================================================
-- CATEGORÍAS Y SUBCATEGORÍAS DE COSTO
-- =========================================================
CREATE TABLE public.categorias_costo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('servicio','operacional','ambos')),
  activa BOOLEAN DEFAULT true
);
ALTER TABLE public.categorias_costo ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.subcategorias_costo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID NOT NULL REFERENCES public.categorias_costo(id),
  nombre TEXT NOT NULL,
  aplica_a TEXT CHECK (aplica_a IN ('servicio','operacional','ambos')),
  activa BOOLEAN DEFAULT true
);
ALTER TABLE public.subcategorias_costo ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- PROVEEDORES
-- =========================================================
CREATE TABLE public.proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rut TEXT UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  giro TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- COSTOS
-- =========================================================
CREATE TABLE public.costos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID REFERENCES public.ordenes_servicio(id),
  grua_id UUID REFERENCES public.gruas(id),
  proveedor_id UUID REFERENCES public.proveedores(id),
  categoria_id UUID REFERENCES public.categorias_costo(id),
  subcategoria_id UUID REFERENCES public.subcategorias_costo(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  monto NUMERIC NOT NULL,
  medio_pago TEXT,
  numero_documento TEXT,
  descripcion TEXT,
  archivo_url TEXT,
  tipo TEXT CHECK (tipo IN ('servicio','operacional')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.costos ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- COTIZACIONES
-- =========================================================
CREATE TABLE public.cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  fecha_emision DATE DEFAULT CURRENT_DATE,
  fecha_vencimiento DATE,
  condicion_pago INTEGER DEFAULT 0,
  subtotal NUMERIC DEFAULT 0,
  iva NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  iva_incluido BOOLEAN DEFAULT true,
  estado TEXT DEFAULT 'borrador' CHECK (estado IN (
    'borrador','enviada','aprobada','rechazada','vencida','facturada')),
  observaciones TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cotizacion_lineas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id UUID NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  orden_id UUID REFERENCES public.ordenes_servicio(id),
  descripcion TEXT NOT NULL,
  cantidad INTEGER DEFAULT 1,
  precio_unitario NUMERIC DEFAULT 0,
  descuento NUMERIC DEFAULT 0,
  total_linea NUMERIC DEFAULT 0
);
ALTER TABLE public.cotizacion_lineas ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- ÓRDENES DE COMPRA
-- =========================================================
CREATE TABLE public.ordenes_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_interno TEXT UNIQUE,
  numero_cliente TEXT,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  cotizacion_id UUID REFERENCES public.cotizaciones(id),
  fecha_recepcion DATE DEFAULT CURRENT_DATE,
  monto_total NUMERIC DEFAULT 0,
  monto_ejecutado NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'recibida' CHECK (estado IN (
   'recibida','en_ejecucion','parcialmente_facturada','facturada','anulada')),
  archivo_pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ordenes_compra ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- CIERRES
-- =========================================================
CREATE TABLE public.cierres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  periodo_inicio DATE NOT NULL,
  periodo_fin DATE NOT NULL,
  folio_cliente TEXT,
  folio_fecha_recepcion DATE,
  folio_vencimiento DATE,
  subtotal NUMERIC DEFAULT 0,
  iva NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'abierto' CHECK (estado IN (
    'abierto','enviado','con_folio','facturado','pagado','anulado')),
  factura_folio_sii TEXT,
  factura_fecha DATE,
  pago_fecha DATE,
  pago_monto NUMERIC,
  pago_medio TEXT,
  pago_referencia TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.cierres ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_cierres_updated BEFORE UPDATE ON public.cierres
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cierre_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cierre_id UUID NOT NULL REFERENCES public.cierres(id) ON DELETE CASCADE,
  orden_id UUID NOT NULL REFERENCES public.ordenes_servicio(id),
  monto_aplicado NUMERIC,
  UNIQUE(orden_id)
);
ALTER TABLE public.cierre_servicios ENABLE ROW LEVEL SECURITY;

-- No facturar cierre sin folio si cliente lo requiere
CREATE OR REPLACE FUNCTION public.validar_cierre_facturado()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  req_folio BOOLEAN;
BEGIN
  IF NEW.estado IN ('facturado','pagado') THEN
    SELECT requiere_folio INTO req_folio FROM public.clientes WHERE id = NEW.cliente_id;
    IF req_folio AND (NEW.folio_cliente IS NULL OR NEW.folio_cliente = '') THEN
      RAISE EXCEPTION 'El cliente requiere folio. No se puede marcar el cierre como facturado sin folio_cliente.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_cierre_facturado
  BEFORE INSERT OR UPDATE ON public.cierres
  FOR EACH ROW EXECUTE FUNCTION public.validar_cierre_facturado();

-- =========================================================
-- BODEGA
-- =========================================================
CREATE TABLE public.bodega_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  subcategoria_id UUID REFERENCES public.subcategorias_costo(id),
  proveedor_id UUID REFERENCES public.proveedores(id),
  stock_actual NUMERIC DEFAULT 0,
  stock_minimo NUMERIC DEFAULT 0,
  precio_costo NUMERIC DEFAULT 0,
  unidad TEXT DEFAULT 'unidad',
  ubicacion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bodega_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bodega_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.bodega_items(id),
  orden_id UUID REFERENCES public.ordenes_servicio(id),
  grua_id UUID REFERENCES public.gruas(id),
  tipo TEXT CHECK (tipo IN ('entrada','salida','ajuste')),
  cantidad NUMERIC NOT NULL,
  fecha DATE DEFAULT CURRENT_DATE,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bodega_movimientos ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- ÍNDICES
-- =========================================================
CREATE INDEX ON public.ordenes_servicio(cliente_id);
CREATE INDEX ON public.ordenes_servicio(estado);
CREATE INDEX ON public.ordenes_servicio(fecha_servicio);
CREATE INDEX ON public.ordenes_servicio(folio_interno);
CREATE INDEX ON public.ordenes_servicio(operador_id);
CREATE INDEX ON public.ordenes_servicio(grua_id);
CREATE INDEX ON public.cierres(cliente_id);
CREATE INDEX ON public.cierres(estado);
CREATE INDEX ON public.cierre_servicios(cierre_id);
CREATE INDEX ON public.costos(fecha);
CREATE INDEX ON public.costos(orden_id);
CREATE INDEX ON public.comisiones(operador_id);
CREATE INDEX ON public.comisiones(estado);
CREATE INDEX ON public.clientes(rut);
CREATE INDEX ON public.clientes_vehiculos(cliente_id);
CREATE INDEX ON public.bodega_movimientos(item_id);

-- =========================================================
-- POLÍTICAS RLS
-- =========================================================
-- Helpers: cualquier autenticado lee; operador o admin escribe operativo;
-- contador o admin escribe financiero; solo admin escribe configuración.

-- Lectura general para todas las tablas operativas (autenticados)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config_empresa','vehiculos_catalogo','clientes','clientes_vehiculos',
    'operadores','gruas','ordenes_servicio','config_comisiones','comisiones',
    'categorias_costo','subcategorias_costo','proveedores','costos',
    'cotizaciones','cotizacion_lineas','ordenes_compra','cierres','cierre_servicios',
    'bodega_items','bodega_movimientos'
  ]
  LOOP
    EXECUTE format('CREATE POLICY "Autenticados leen %1$s" ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Operativo: operador o admin (INSERT/UPDATE)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clientes','clientes_vehiculos','vehiculos_catalogo','operadores','gruas',
    'ordenes_servicio','bodega_items','bodega_movimientos','proveedores'
  ]
  LOOP
    EXECUTE format($f$CREATE POLICY "Operador o admin inserta %1$s" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin'))$f$, t);
    EXECUTE format($f$CREATE POLICY "Operador o admin actualiza %1$s" ON public.%1$s FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'operador') OR public.has_role(auth.uid(),'admin'))$f$, t);
    EXECUTE format($f$CREATE POLICY "Admin elimina %1$s" ON public.%1$s FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'))$f$, t);
  END LOOP;
END $$;

-- Financiero: contador o admin
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cotizaciones','cotizacion_lineas','ordenes_compra','cierres','cierre_servicios','costos','comisiones'
  ]
  LOOP
    EXECUTE format($f$CREATE POLICY "Contador o admin inserta %1$s" ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'contador') OR public.has_role(auth.uid(),'admin'))$f$, t);
    EXECUTE format($f$CREATE POLICY "Contador o admin actualiza %1$s" ON public.%1$s FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'contador') OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'contador') OR public.has_role(auth.uid(),'admin'))$f$, t);
    EXECUTE format($f$CREATE POLICY "Admin elimina %1$s" ON public.%1$s FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'))$f$, t);
  END LOOP;
END $$;

-- Configuración: solo admin
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'config_empresa','config_comisiones','categorias_costo','subcategorias_costo'
  ]
  LOOP
    EXECUTE format($f$CREATE POLICY "Solo admin gestiona %1$s" ON public.%1$s FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'))$f$, t);
  END LOOP;
END $$;
