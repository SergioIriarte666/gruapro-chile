-- Seed demo operativo e idempotente para poblar la app con datos de prueba.
DO $$
DECLARE
  v_cliente_flotas uuid;
  v_cliente_aseguradora uuid;
  v_cliente_persona uuid;
  v_catalogo_hilux uuid;
  v_catalogo_actros uuid;
  v_catalogo_spark uuid;
  v_catalogo_ducato uuid;
  v_vehiculo_flotas_1 uuid;
  v_vehiculo_flotas_2 uuid;
  v_vehiculo_aseguradora_1 uuid;
  v_vehiculo_persona_1 uuid;
  v_grua_1 uuid;
  v_grua_2 uuid;
  v_grua_3 uuid;
  v_operador_1 uuid;
  v_operador_2 uuid;
  v_operador_3 uuid;
  v_cat_servicio uuid;
  v_cat_operacional uuid;
  v_cat_bodega uuid;
  v_subcat_combustible uuid;
  v_subcat_peajes uuid;
  v_subcat_lubricantes uuid;
  v_subcat_repuestos uuid;
  v_subcat_rescate uuid;
  v_proveedor_1 uuid;
  v_proveedor_2 uuid;
  v_proveedor_3 uuid;
  v_item_1 uuid;
  v_item_2 uuid;
  v_item_3 uuid;
  v_orden_1 uuid;
  v_orden_2 uuid;
  v_orden_3 uuid;
  v_orden_4 uuid;
  v_orden_5 uuid;
  v_orden_6 uuid;
  v_cot_1 uuid;
  v_cot_2 uuid;
  v_oc_1 uuid;
  v_cierre_1 uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.config_empresa) THEN
    INSERT INTO public.config_empresa (
      nombre,
      rut,
      direccion,
      telefono,
      email,
      folio_prefijo,
      folio_incluir_anio,
      folio_digitos,
      folio_contador,
      iva_porcentaje
    )
    VALUES (
      'GruaPro Chile Demo',
      '76.543.210-9',
      'Av. Americo Vespucio 2450, Santiago',
      '+56 2 2680 4455',
      'contacto@gruapro-demo.cl',
      'OS',
      true,
      4,
      0,
      19
    );
  END IF;

  INSERT INTO public.config_comisiones (tipo_servicio, monto_comision)
  VALUES
    ('remolque_local', 25000),
    ('larga_distancia', 55000),
    ('izaje', 60000),
    ('rescate', 35000),
    ('traslado', 18000)
  ON CONFLICT (tipo_servicio) DO NOTHING;

  INSERT INTO public.categorias_costo (nombre, tipo, activa)
  SELECT 'Servicios en ruta', 'servicio', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categorias_costo WHERE nombre = 'Servicios en ruta'
  );

  INSERT INTO public.categorias_costo (nombre, tipo, activa)
  SELECT 'Operacion y taller', 'operacional', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categorias_costo WHERE nombre = 'Operacion y taller'
  );

  INSERT INTO public.categorias_costo (nombre, tipo, activa)
  SELECT 'Bodega general', 'ambos', true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categorias_costo WHERE nombre = 'Bodega general'
  );

  SELECT id INTO v_cat_servicio
  FROM public.categorias_costo
  WHERE nombre = 'Servicios en ruta'
  LIMIT 1;

  SELECT id INTO v_cat_operacional
  FROM public.categorias_costo
  WHERE nombre = 'Operacion y taller'
  LIMIT 1;

  SELECT id INTO v_cat_bodega
  FROM public.categorias_costo
  WHERE nombre = 'Bodega general'
  LIMIT 1;

  INSERT INTO public.subcategorias_costo (categoria_id, nombre, aplica_a, activa)
  SELECT v_cat_servicio, 'Combustible', 'servicio', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subcategorias_costo
    WHERE categoria_id = v_cat_servicio AND nombre = 'Combustible'
  );

  INSERT INTO public.subcategorias_costo (categoria_id, nombre, aplica_a, activa)
  SELECT v_cat_servicio, 'Peajes', 'servicio', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subcategorias_costo
    WHERE categoria_id = v_cat_servicio AND nombre = 'Peajes'
  );

  INSERT INTO public.subcategorias_costo (categoria_id, nombre, aplica_a, activa)
  SELECT v_cat_operacional, 'Lubricantes', 'operacional', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subcategorias_costo
    WHERE categoria_id = v_cat_operacional AND nombre = 'Lubricantes'
  );

  INSERT INTO public.subcategorias_costo (categoria_id, nombre, aplica_a, activa)
  SELECT v_cat_operacional, 'Repuestos', 'ambos', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subcategorias_costo
    WHERE categoria_id = v_cat_operacional AND nombre = 'Repuestos'
  );

  INSERT INTO public.subcategorias_costo (categoria_id, nombre, aplica_a, activa)
  SELECT v_cat_bodega, 'Insumos de rescate', 'ambos', true
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.subcategorias_costo
    WHERE categoria_id = v_cat_bodega AND nombre = 'Insumos de rescate'
  );

  SELECT id INTO v_subcat_combustible
  FROM public.subcategorias_costo
  WHERE categoria_id = v_cat_servicio AND nombre = 'Combustible'
  LIMIT 1;

  SELECT id INTO v_subcat_peajes
  FROM public.subcategorias_costo
  WHERE categoria_id = v_cat_servicio AND nombre = 'Peajes'
  LIMIT 1;

  SELECT id INTO v_subcat_lubricantes
  FROM public.subcategorias_costo
  WHERE categoria_id = v_cat_operacional AND nombre = 'Lubricantes'
  LIMIT 1;

  SELECT id INTO v_subcat_repuestos
  FROM public.subcategorias_costo
  WHERE categoria_id = v_cat_operacional AND nombre = 'Repuestos'
  LIMIT 1;

  SELECT id INTO v_subcat_rescate
  FROM public.subcategorias_costo
  WHERE categoria_id = v_cat_bodega AND nombre = 'Insumos de rescate'
  LIMIT 1;

  INSERT INTO public.proveedores (rut, nombre, email, telefono, giro)
  VALUES
    ('76.345.678-5', 'Combustibles del Sur SpA', 'facturacion@combustiblesdelsur.cl', '+56 9 8765 0001', 'Combustibles'),
    ('76.456.789-4', 'Taller Ruta 68 Ltda.', 'contacto@tallerruta68.cl', '+56 9 8765 0002', 'Mantencion automotriz'),
    ('76.567.890-3', 'Rescate Industrial Spa', 'ventas@rescateindustrial.cl', '+56 9 8765 0003', 'Equipos y accesorios')
  ON CONFLICT (rut) DO NOTHING;

  SELECT id INTO v_proveedor_1 FROM public.proveedores WHERE rut = '76.345.678-5' LIMIT 1;
  SELECT id INTO v_proveedor_2 FROM public.proveedores WHERE rut = '76.456.789-4' LIMIT 1;
  SELECT id INTO v_proveedor_3 FROM public.proveedores WHERE rut = '76.567.890-3' LIMIT 1;

  INSERT INTO public.vehiculos_catalogo (marca, modelo, anio, tipo, combustible, estado)
  SELECT 'Toyota', 'Hilux', 2022, 'Camioneta', 'Diesel', 'activo'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehiculos_catalogo
    WHERE marca = 'Toyota' AND modelo = 'Hilux' AND anio = 2022
  );

  INSERT INTO public.vehiculos_catalogo (marca, modelo, anio, tipo, combustible, estado)
  SELECT 'Mercedes-Benz', 'Actros 2645', 2021, 'Camión', 'Diesel', 'activo'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehiculos_catalogo
    WHERE marca = 'Mercedes-Benz' AND modelo = 'Actros 2645' AND anio = 2021
  );

  INSERT INTO public.vehiculos_catalogo (marca, modelo, anio, tipo, combustible, estado)
  SELECT 'Chevrolet', 'Spark GT', 2020, 'Auto', 'Bencina', 'activo'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehiculos_catalogo
    WHERE marca = 'Chevrolet' AND modelo = 'Spark GT' AND anio = 2020
  );

  INSERT INTO public.vehiculos_catalogo (marca, modelo, anio, tipo, combustible, estado)
  SELECT 'Fiat', 'Ducato', 2019, 'Furgón', 'Diesel', 'activo'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.vehiculos_catalogo
    WHERE marca = 'Fiat' AND modelo = 'Ducato' AND anio = 2019
  );

  SELECT id INTO v_catalogo_hilux
  FROM public.vehiculos_catalogo
  WHERE marca = 'Toyota' AND modelo = 'Hilux' AND anio = 2022
  LIMIT 1;

  SELECT id INTO v_catalogo_actros
  FROM public.vehiculos_catalogo
  WHERE marca = 'Mercedes-Benz' AND modelo = 'Actros 2645' AND anio = 2021
  LIMIT 1;

  SELECT id INTO v_catalogo_spark
  FROM public.vehiculos_catalogo
  WHERE marca = 'Chevrolet' AND modelo = 'Spark GT' AND anio = 2020
  LIMIT 1;

  SELECT id INTO v_catalogo_ducato
  FROM public.vehiculos_catalogo
  WHERE marca = 'Fiat' AND modelo = 'Ducato' AND anio = 2019
  LIMIT 1;

  INSERT INTO public.clientes (
    rut,
    nombre,
    tipo,
    email,
    telefono,
    direccion,
    condicion_pago,
    requiere_folio,
    periodo_cierre,
    emails_cierre,
    iva_incluido,
    observaciones
  )
  VALUES
    ('76.111.222-3', 'Flotas Industriales Norte SpA', 'empresa', 'operaciones@flotasnorte.cl', '+56 2 2456 7810', 'Camino a Melipilla 18020, Maipu', 30, true, 'mensual', ARRAY['cierre@flotasnorte.cl','facturas@flotasnorte.cl'], true, 'Cliente demo con cierre mensual y folio obligatorio'),
    ('76.222.333-4', 'Aseguradora Andina', 'aseguradora', 'siniestros@aseguradoraandina.cl', '+56 2 2789 4400', 'Av. Apoquindo 4800, Las Condes', 45, true, 'quincenal', ARRAY['cierres@aseguradoraandina.cl'], true, 'Cliente demo para servicios asociados a siniestros'),
    ('14.223.334-5', 'Daniela Soto Rojas', 'persona_natural', 'daniela.soto@email.cl', '+56 9 8123 4455', 'Av. Grecia 9250, Penalolen', 0, false, 'semanal', ARRAY['daniela.soto@email.cl'], true, 'Cliente demo persona natural')
  ON CONFLICT (rut) DO NOTHING;

  SELECT id INTO v_cliente_flotas FROM public.clientes WHERE rut = '76.111.222-3' LIMIT 1;
  SELECT id INTO v_cliente_aseguradora FROM public.clientes WHERE rut = '76.222.333-4' LIMIT 1;
  SELECT id INTO v_cliente_persona FROM public.clientes WHERE rut = '14.223.334-5' LIMIT 1;

  INSERT INTO public.clientes_vehiculos (cliente_id, vehiculo_catalogo_id, patente, color, observaciones)
  SELECT v_cliente_flotas, v_catalogo_hilux, 'PTGX61', 'Blanco', 'Camioneta de supervisión demo'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.clientes_vehiculos
    WHERE cliente_id = v_cliente_flotas AND patente = 'PTGX61'
  );

  INSERT INTO public.clientes_vehiculos (cliente_id, vehiculo_catalogo_id, patente, color, observaciones)
  SELECT v_cliente_flotas, v_catalogo_actros, 'LKJH42', 'Azul', 'Camión de distribución demo'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.clientes_vehiculos
    WHERE cliente_id = v_cliente_flotas AND patente = 'LKJH42'
  );

  INSERT INTO public.clientes_vehiculos (cliente_id, vehiculo_catalogo_id, patente, color, observaciones)
  SELECT v_cliente_aseguradora, v_catalogo_spark, 'RSDT18', 'Gris', 'Vehículo demo para siniestros'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.clientes_vehiculos
    WHERE cliente_id = v_cliente_aseguradora AND patente = 'RSDT18'
  );

  INSERT INTO public.clientes_vehiculos (cliente_id, vehiculo_catalogo_id, patente, color, observaciones)
  SELECT v_cliente_persona, v_catalogo_ducato, 'MNBV71', 'Blanco', 'Furgón demo particular'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.clientes_vehiculos
    WHERE cliente_id = v_cliente_persona AND patente = 'MNBV71'
  );

  SELECT id INTO v_vehiculo_flotas_1
  FROM public.clientes_vehiculos
  WHERE cliente_id = v_cliente_flotas AND patente = 'PTGX61'
  LIMIT 1;

  SELECT id INTO v_vehiculo_flotas_2
  FROM public.clientes_vehiculos
  WHERE cliente_id = v_cliente_flotas AND patente = 'LKJH42'
  LIMIT 1;

  SELECT id INTO v_vehiculo_aseguradora_1
  FROM public.clientes_vehiculos
  WHERE cliente_id = v_cliente_aseguradora AND patente = 'RSDT18'
  LIMIT 1;

  SELECT id INTO v_vehiculo_persona_1
  FROM public.clientes_vehiculos
  WHERE cliente_id = v_cliente_persona AND patente = 'MNBV71'
  LIMIT 1;

  INSERT INTO public.gruas (
    patente,
    marca,
    modelo,
    anio,
    tipo_grua,
    estado,
    fecha_incorporacion
  )
  VALUES
    ('KJTR91', 'Iveco', 'Daily 70C', 2022, 'plataforma', 'activa', current_date - 500),
    ('LPRD22', 'Mercedes-Benz', 'Atego 1726', 2020, 'pluma', 'en_mantencion', current_date - 900),
    ('MFZX54', 'Ford', 'Cargo 1729', 2018, 'portacontenedor', 'baja', current_date - 1500)
  ON CONFLICT (patente) DO NOTHING;

  SELECT id INTO v_grua_1 FROM public.gruas WHERE patente = 'KJTR91' LIMIT 1;
  SELECT id INTO v_grua_2 FROM public.gruas WHERE patente = 'LPRD22' LIMIT 1;
  SELECT id INTO v_grua_3 FROM public.gruas WHERE patente = 'MFZX54' LIMIT 1;

  INSERT INTO public.operadores (
    rut,
    nombre,
    telefono,
    licencia_clase,
    licencia_vencimiento,
    tipo_contrato,
    sueldo_base,
    estado
  )
  VALUES
    ('16.234.567-8', 'Juan Pablo Riquelme', '+56 9 7111 2233', 'A4', current_date + 260, 'planta', 950000, 'activo'),
    ('17.345.678-9', 'Carlos Muñoz Vera', '+56 9 7222 3344', 'A5', current_date + 120, 'honorarios', 780000, 'vacaciones'),
    ('18.456.789-0', 'Sebastian Orellana Diaz', '+56 9 7333 4455', 'B', current_date + 430, 'externo', 650000, 'inactivo')
  ON CONFLICT (rut) DO NOTHING;

  SELECT id INTO v_operador_1 FROM public.operadores WHERE rut = '16.234.567-8' LIMIT 1;
  SELECT id INTO v_operador_2 FROM public.operadores WHERE rut = '17.345.678-9' LIMIT 1;
  SELECT id INTO v_operador_3 FROM public.operadores WHERE rut = '18.456.789-0' LIMIT 1;

  SELECT id INTO v_orden_1
  FROM public.ordenes_servicio
  WHERE folio_siniestro = 'SIN-DEMO-001'
  LIMIT 1;

  IF v_orden_1 IS NULL THEN
    INSERT INTO public.ordenes_servicio (
      folio_cliente,
      folio_siniestro,
      cliente_id,
      cliente_vehiculo_id,
      tipo_servicio,
      origen,
      destino,
      estado,
      monto,
      forma_pago,
      fecha_servicio,
      observaciones
    )
    VALUES (
      'SEED-DEMO-OS-001',
      'SIN-DEMO-001',
      v_cliente_aseguradora,
      v_vehiculo_aseguradora_1,
      'remolque_local',
      'Las Condes',
      'Providencia',
      'pendiente',
      65000,
      'aseguradora',
      now() - interval '2 hours',
      'Orden demo pendiente sin asignacion'
    )
    RETURNING id INTO v_orden_1;
  END IF;

  SELECT id INTO v_orden_2
  FROM public.ordenes_servicio
  WHERE folio_siniestro = 'SIN-DEMO-002'
  LIMIT 1;

  IF v_orden_2 IS NULL THEN
    INSERT INTO public.ordenes_servicio (
      folio_cliente,
      folio_siniestro,
      cliente_id,
      cliente_vehiculo_id,
      grua_id,
      operador_id,
      tipo_servicio,
      origen,
      destino,
      estado,
      monto,
      forma_pago,
      fecha_servicio,
      observaciones
    )
    VALUES (
      'SEED-DEMO-OS-002',
      'SIN-DEMO-002',
      v_cliente_flotas,
      v_vehiculo_flotas_1,
      v_grua_1,
      v_operador_1,
      'traslado',
      'Pudahuel',
      'Quilicura',
      'en_curso',
      120000,
      'credito',
      now() - interval '3 hours',
      'Orden demo en curso para tablero operacional'
    )
    RETURNING id INTO v_orden_2;
  END IF;

  SELECT id INTO v_orden_3
  FROM public.ordenes_servicio
  WHERE folio_siniestro = 'SIN-DEMO-003'
  LIMIT 1;

  IF v_orden_3 IS NULL THEN
    INSERT INTO public.ordenes_servicio (
      folio_cliente,
      folio_siniestro,
      cliente_id,
      cliente_vehiculo_id,
      grua_id,
      operador_id,
      tipo_servicio,
      origen,
      destino,
      estado,
      monto,
      forma_pago,
      fecha_servicio,
      observaciones
    )
    VALUES (
      'CIE-DEMO-9001',
      'SIN-DEMO-003',
      v_cliente_flotas,
      v_vehiculo_flotas_1,
      v_grua_1,
      v_operador_1,
      'remolque_local',
      'San Bernardo',
      'Renca',
      'completado',
      185000,
      'credito',
      now() - interval '10 days',
      'Servicio demo listo para cierre'
    )
    RETURNING id INTO v_orden_3;
  END IF;

  SELECT id INTO v_orden_4
  FROM public.ordenes_servicio
  WHERE folio_siniestro = 'SIN-DEMO-004'
  LIMIT 1;

  IF v_orden_4 IS NULL THEN
    INSERT INTO public.ordenes_servicio (
      folio_cliente,
      folio_siniestro,
      cliente_id,
      cliente_vehiculo_id,
      grua_id,
      operador_id,
      tipo_servicio,
      origen,
      destino,
      estado,
      monto,
      forma_pago,
      fecha_servicio,
      observaciones
    )
    VALUES (
      'CIE-DEMO-9002',
      'SIN-DEMO-004',
      v_cliente_flotas,
      v_vehiculo_flotas_2,
      v_grua_1,
      v_operador_1,
      'larga_distancia',
      'Santiago',
      'Rancagua',
      'completado',
      220000,
      'credito',
      now() - interval '7 days',
      'Servicio demo listo para cierre'
    )
    RETURNING id INTO v_orden_4;
  END IF;

  SELECT id INTO v_orden_5
  FROM public.ordenes_servicio
  WHERE folio_siniestro = 'SIN-DEMO-005'
  LIMIT 1;

  IF v_orden_5 IS NULL THEN
    INSERT INTO public.ordenes_servicio (
      folio_cliente,
      folio_siniestro,
      cliente_id,
      cliente_vehiculo_id,
      grua_id,
      operador_id,
      tipo_servicio,
      origen,
      destino,
      estado,
      monto,
      forma_pago,
      fecha_servicio,
      observaciones
    )
    VALUES (
      'OC-DEMO-9001',
      'SIN-DEMO-005',
      v_cliente_aseguradora,
      v_vehiculo_aseguradora_1,
      v_grua_2,
      v_operador_2,
      'izaje',
      'Vitacura',
      'Huechuraba',
      'completado',
      340000,
      'aseguradora',
      now() - interval '4 days',
      'Servicio demo asociado a OC cliente'
    )
    RETURNING id INTO v_orden_5;
  END IF;

  SELECT id INTO v_orden_6
  FROM public.ordenes_servicio
  WHERE folio_siniestro = 'SIN-DEMO-006'
  LIMIT 1;

  IF v_orden_6 IS NULL THEN
    INSERT INTO public.ordenes_servicio (
      folio_cliente,
      folio_siniestro,
      cliente_id,
      cliente_vehiculo_id,
      grua_id,
      operador_id,
      tipo_servicio,
      origen,
      destino,
      estado,
      monto,
      forma_pago,
      fecha_servicio,
      observaciones
    )
    VALUES (
      'OC-DEMO-9001',
      'SIN-DEMO-006',
      v_cliente_aseguradora,
      v_vehiculo_aseguradora_1,
      v_grua_1,
      v_operador_1,
      'rescate',
      'Lo Barnechea',
      'Las Condes',
      'facturado',
      180000,
      'aseguradora',
      now() - interval '18 days',
      'Servicio demo ya facturado'
    )
    RETURNING id INTO v_orden_6;
  END IF;

  INSERT INTO public.comisiones (orden_id, operador_id, monto_comision, estado, fecha_pago)
  SELECT v_orden_3, v_operador_1, 25000, 'pendiente', NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.comisiones WHERE orden_id = v_orden_3);

  INSERT INTO public.comisiones (orden_id, operador_id, monto_comision, estado, fecha_pago)
  SELECT v_orden_5, v_operador_2, 60000, 'pendiente', NULL
  WHERE NOT EXISTS (SELECT 1 FROM public.comisiones WHERE orden_id = v_orden_5);

  INSERT INTO public.comisiones (orden_id, operador_id, monto_comision, estado, fecha_pago)
  SELECT v_orden_6, v_operador_1, 35000, 'pagado', current_date - 5
  WHERE NOT EXISTS (SELECT 1 FROM public.comisiones WHERE orden_id = v_orden_6);

  INSERT INTO public.costos (
    orden_id,
    grua_id,
    proveedor_id,
    categoria_id,
    subcategoria_id,
    fecha,
    monto,
    medio_pago,
    numero_documento,
    descripcion,
    tipo
  )
  SELECT
    v_orden_3,
    v_grua_1,
    v_proveedor_1,
    v_cat_servicio,
    v_subcat_combustible,
    current_date - 10,
    45000,
    'tarjeta flota',
    'SEED-COST-001',
    'Carga de diesel para servicio demo',
    'servicio'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.costos WHERE numero_documento = 'SEED-COST-001'
  );

  INSERT INTO public.costos (
    orden_id,
    grua_id,
    proveedor_id,
    categoria_id,
    subcategoria_id,
    fecha,
    monto,
    medio_pago,
    numero_documento,
    descripcion,
    tipo
  )
  SELECT
    v_orden_5,
    v_grua_2,
    NULL,
    v_cat_servicio,
    v_subcat_peajes,
    current_date - 4,
    18000,
    'telepeaje',
    'SEED-COST-002',
    'Peajes asociados a servicio demo',
    'servicio'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.costos WHERE numero_documento = 'SEED-COST-002'
  );

  INSERT INTO public.costos (
    orden_id,
    grua_id,
    proveedor_id,
    categoria_id,
    subcategoria_id,
    fecha,
    monto,
    medio_pago,
    numero_documento,
    descripcion,
    tipo
  )
  SELECT
    NULL,
    v_grua_2,
    v_proveedor_2,
    v_cat_operacional,
    v_subcat_lubricantes,
    current_date - 6,
    120000,
    'transferencia',
    'SEED-COST-003',
    'Mantencion preventiva demo',
    'operacional'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.costos WHERE numero_documento = 'SEED-COST-003'
  );

  SELECT id INTO v_cot_1
  FROM public.cotizaciones
  WHERE numero = 'COT-9001'
  LIMIT 1;

  IF v_cot_1 IS NULL THEN
    INSERT INTO public.cotizaciones (
      numero,
      cliente_id,
      fecha_emision,
      fecha_vencimiento,
      condicion_pago,
      subtotal,
      iva,
      total,
      iva_incluido,
      estado,
      observaciones
    )
    VALUES (
      'COT-9001',
      v_cliente_aseguradora,
      current_date - 15,
      current_date + 15,
      45,
      630252,
      119748,
      750000,
      true,
      'aprobada',
      'Cotizacion demo aprobada para generar OC'
    )
    RETURNING id INTO v_cot_1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cotizacion_lineas WHERE cotizacion_id = v_cot_1) THEN
    INSERT INTO public.cotizacion_lineas (
      cotizacion_id,
      orden_id,
      descripcion,
      cantidad,
      precio_unitario,
      descuento,
      total_linea
    )
    VALUES
      (v_cot_1, v_orden_5, 'Servicio de izaje con apoyo de grua pluma', 1, 420000, 0, 420000),
      (v_cot_1, v_orden_6, 'Rescate urbano y traslado a taller convenio', 1, 330000, 0, 330000);
  END IF;

  SELECT id INTO v_cot_2
  FROM public.cotizaciones
  WHERE numero = 'COT-9002'
  LIMIT 1;

  IF v_cot_2 IS NULL THEN
    INSERT INTO public.cotizaciones (
      numero,
      cliente_id,
      fecha_emision,
      fecha_vencimiento,
      condicion_pago,
      subtotal,
      iva,
      total,
      iva_incluido,
      estado,
      observaciones
    )
    VALUES (
      'COT-9002',
      v_cliente_flotas,
      current_date - 2,
      current_date + 20,
      30,
      260504,
      49496,
      310000,
      true,
      'borrador',
      'Cotizacion demo en borrador'
    )
    RETURNING id INTO v_cot_2;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cotizacion_lineas WHERE cotizacion_id = v_cot_2) THEN
    INSERT INTO public.cotizacion_lineas (
      cotizacion_id,
      orden_id,
      descripcion,
      cantidad,
      precio_unitario,
      descuento,
      total_linea
    )
    VALUES
      (v_cot_2, NULL, 'Bolsa de 5 traslados urbanos programados', 1, 310000, 0, 310000);
  END IF;

  SELECT id INTO v_oc_1
  FROM public.ordenes_compra
  WHERE numero_interno = 'OC-9001'
  LIMIT 1;

  IF v_oc_1 IS NULL THEN
    INSERT INTO public.ordenes_compra (
      numero_interno,
      numero_cliente,
      cliente_id,
      cotizacion_id,
      fecha_recepcion,
      monto_total,
      monto_ejecutado,
      estado,
      archivo_pdf_url
    )
    VALUES (
      'OC-9001',
      'OC-DEMO-9001',
      v_cliente_aseguradora,
      v_cot_1,
      current_date - 12,
      750000,
      520000,
      'en_ejecucion',
      NULL
    )
    RETURNING id INTO v_oc_1;
  END IF;

  SELECT id INTO v_cierre_1
  FROM public.cierres
  WHERE numero = 'CIE-9001'
  LIMIT 1;

  IF v_cierre_1 IS NULL THEN
    INSERT INTO public.cierres (
      numero,
      cliente_id,
      periodo_inicio,
      periodo_fin,
      subtotal,
      iva,
      total,
      estado
    )
    VALUES (
      'CIE-9001',
      v_cliente_flotas,
      current_date - 15,
      current_date - 1,
      340336,
      64664,
      405000,
      'enviado'
    )
    RETURNING id INTO v_cierre_1;
  END IF;

  INSERT INTO public.cierre_servicios (cierre_id, orden_id, monto_aplicado)
  SELECT v_cierre_1, v_orden_3, 185000
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cierre_servicios WHERE orden_id = v_orden_3
  );

  INSERT INTO public.cierre_servicios (cierre_id, orden_id, monto_aplicado)
  SELECT v_cierre_1, v_orden_4, 220000
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cierre_servicios WHERE orden_id = v_orden_4
  );

  INSERT INTO public.bodega_items (
    nombre,
    subcategoria_id,
    proveedor_id,
    stock_actual,
    stock_minimo,
    precio_costo,
    unidad,
    ubicacion
  )
  SELECT
    'DEMO - Eslinga poliester 3T',
    v_subcat_rescate,
    v_proveedor_3,
    0,
    2,
    42000,
    'unidad',
    'Rack A-01'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_items WHERE nombre = 'DEMO - Eslinga poliester 3T'
  );

  INSERT INTO public.bodega_items (
    nombre,
    subcategoria_id,
    proveedor_id,
    stock_actual,
    stock_minimo,
    precio_costo,
    unidad,
    ubicacion
  )
  SELECT
    'DEMO - Aceite hidraulico ISO 68',
    v_subcat_lubricantes,
    v_proveedor_2,
    0,
    4,
    18500,
    'litro',
    'Rack B-02'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_items WHERE nombre = 'DEMO - Aceite hidraulico ISO 68'
  );

  INSERT INTO public.bodega_items (
    nombre,
    subcategoria_id,
    proveedor_id,
    stock_actual,
    stock_minimo,
    precio_costo,
    unidad,
    ubicacion
  )
  SELECT
    'DEMO - Foco led magnetico',
    v_subcat_repuestos,
    v_proveedor_3,
    0,
    3,
    9500,
    'unidad',
    'Rack C-03'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_items WHERE nombre = 'DEMO - Foco led magnetico'
  );

  SELECT id INTO v_item_1 FROM public.bodega_items WHERE nombre = 'DEMO - Eslinga poliester 3T' LIMIT 1;
  SELECT id INTO v_item_2 FROM public.bodega_items WHERE nombre = 'DEMO - Aceite hidraulico ISO 68' LIMIT 1;
  SELECT id INTO v_item_3 FROM public.bodega_items WHERE nombre = 'DEMO - Foco led magnetico' LIMIT 1;

  INSERT INTO public.bodega_movimientos (item_id, orden_id, grua_id, tipo, cantidad, fecha, descripcion)
  SELECT v_item_1, NULL, NULL, 'entrada', 6, current_date - 12, 'Seed demo entrada inicial'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_movimientos
    WHERE item_id = v_item_1 AND descripcion = 'Seed demo entrada inicial'
  );

  INSERT INTO public.bodega_movimientos (item_id, orden_id, grua_id, tipo, cantidad, fecha, descripcion)
  SELECT v_item_1, v_orden_5, v_grua_2, 'salida', 1, current_date - 4, 'Seed demo uso en servicio'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_movimientos
    WHERE item_id = v_item_1 AND descripcion = 'Seed demo uso en servicio'
  );

  INSERT INTO public.bodega_movimientos (item_id, orden_id, grua_id, tipo, cantidad, fecha, descripcion)
  SELECT v_item_2, NULL, v_grua_2, 'entrada', 8, current_date - 8, 'Seed demo compra lubricantes'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_movimientos
    WHERE item_id = v_item_2 AND descripcion = 'Seed demo compra lubricantes'
  );

  INSERT INTO public.bodega_movimientos (item_id, orden_id, grua_id, tipo, cantidad, fecha, descripcion)
  SELECT v_item_2, NULL, v_grua_2, 'salida', 5, current_date - 6, 'Seed demo mantencion grua'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_movimientos
    WHERE item_id = v_item_2 AND descripcion = 'Seed demo mantencion grua'
  );

  INSERT INTO public.bodega_movimientos (item_id, orden_id, grua_id, tipo, cantidad, fecha, descripcion)
  SELECT v_item_3, NULL, NULL, 'entrada', 2, current_date - 3, 'Seed demo stock bajo'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.bodega_movimientos
    WHERE item_id = v_item_3 AND descripcion = 'Seed demo stock bajo'
  );

  INSERT INTO public.service_change_history (
    entity_type,
    entity_id,
    action,
    new_value
  )
  SELECT
    'cliente',
    v_cliente_flotas,
    'seed_created',
    jsonb_build_object('source', 'demo_seed_operativo', 'nombre', 'Flotas Industriales Norte SpA')
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.service_change_history
    WHERE entity_type = 'cliente'
      AND entity_id = v_cliente_flotas
      AND action = 'seed_created'
  );

  INSERT INTO public.service_change_history (
    entity_type,
    entity_id,
    action,
    new_value
  )
  SELECT
    'orden',
    v_orden_5,
    'seed_created',
    jsonb_build_object('source', 'demo_seed_operativo', 'folio_cliente', 'OC-DEMO-9001')
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.service_change_history
    WHERE entity_type = 'orden'
      AND entity_id = v_orden_5
      AND action = 'seed_created'
  );

  INSERT INTO public.service_change_history (
    entity_type,
    entity_id,
    action,
    new_value
  )
  SELECT
    'cierre',
    v_cierre_1,
    'seed_created',
    jsonb_build_object('source', 'demo_seed_operativo', 'numero', 'CIE-9001')
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.service_change_history
    WHERE entity_type = 'cierre'
      AND entity_id = v_cierre_1
      AND action = 'seed_created'
  );
END
$$;
