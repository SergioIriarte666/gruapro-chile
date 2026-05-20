# PRD — GruaPro Chile (ERP Operacional para Grúas)

**Versión:** 1.0  
**Fecha:** 2026-05-20  
**Estado:** Operativo (MVP) + backlog de completitud  
**Repositorio:** `gruapro-chile`  

## 1) Resumen

GruaPro Chile es una aplicación web tipo ERP para la operación de grúas en Chile, diseñada para centralizar y sincronizar en una única base de datos los módulos operacionales (servicios, grúas, operadores, bodega) y financieros (costos, cierres, cotizaciones, órdenes de compra), con trazabilidad (historial de cambios) e importadores (Excel, XML DTE, PDF) para acelerar carga y evitar doble digitación.

La característica principal del producto es la **integración cruzada entre módulos** (single source of truth): una acción en un módulo impacta automáticamente a los módulos relacionados, manteniendo consistencia operativa y contable.

Referencia conceptual: [cross-module-integration.md](file:///Users/sergioiriartevasquez/Desktop/gruapro-chile/cross-module-integration.md).

## 2) Problema a Resolver

Los negocios de grúas operan con información distribuida (planillas, WhatsApp, ERP contable aparte, carpetas de documentos) y sufren:

- Doble ingreso de datos (servicios ↔ facturación ↔ costos ↔ bodega).
- Falta de visibilidad del estado real (en curso, completado, facturado, pagado).
- Pérdida de trazabilidad (quién cambió un monto/estado y cuándo).
- Dificultad para consolidar servicios por cliente/período (cierres).
- Importación manual lenta (costos por XML DTE, planillas Excel, PDFs de OC).

## 3) Objetivos

### 3.1 Objetivos de negocio

- Centralizar operación y finanzas de servicios de grúa en un solo sistema.
- Reducir tiempos de registro (servicios, costos, bodega) con importadores.
- Mejorar control de facturación por cliente mediante cierres (ciclos).
- Habilitar trazabilidad para auditoría interna.

### 3.2 Objetivos de producto

- Permitir gestión end-to-end: Cliente → Servicio → Costos/Bodega → Cierre → Facturación → Pago.
- Mantener datos consistentes mediante constraints/relaciones en Postgres y RLS.
- Proveer interfaz clara y rápida con filtros, listados y acciones por estado.

## 4) Alcance (MVP Operativo)

El alcance se guía por los documentos en [Prompts/](file:///Users/sergioiriartevasquez/Desktop/gruapro-chile/Prompts) (01–12).

### 4.1 Incluido

- Autenticación y roles base (admin/operador/contador).
- Módulos operativos:
  - Clientes + vehículos del cliente
  - Vehículos (catálogo)
  - Grúas
  - Operadores
  - Órdenes de servicio
  - Costos
  - Bodega (ítems + movimientos + stock derivado)
- Módulos financieros/gestión:
  - Cotizaciones
  - Órdenes de compra (OC clientes, vínculo por `folio_cliente`)
  - Cierres
  - Dashboard
  - Importadores (Excel, XML DTE, PDF)
- Auditoría transversal via historial de cambios.

### 4.2 No incluido (por ahora)

- Multi-empresa/multi-sucursal.
- Workflow avanzado de aprobaciones por jerarquía.
- Integración directa con SII o emisión electrónica desde el sistema.
- Conciliación bancaria automática.
- Logística avanzada (ruteo, ETA, tracking GPS).
- Offline-first completo.

## 5) Usuarios, Roles y Permisos

### 5.1 Roles

Definidos en `public.user_roles.role`:

- **admin:** acceso total y administración.
- **operador:** operación diaria (servicios asignados/visibles según políticas).
- **contador:** foco en cierres, costos, facturación y reportes.

### 5.2 Principios de permisos

- **RLS por defecto** en tablas principales.
- Acciones sensibles (anular/facturar/pagar) deben respetar reglas de negocio:
  - No anular un servicio que está incluido en un cierre activo.
  - Los estados deben seguir transiciones válidas.

## 6) Personas (Arquetipos)

- **Despachador/a Operacional:** crea servicios, asigna grúa/operador, controla estado en curso.
- **Administrador/a:** configura comisiones, revisa KPIs, corrige datos, habilita usuarios.
- **Contador/a:** consolida cierres por cliente, registra folios/facturas/pagos, controla pendientes.
- **Jefe/a de Flota:** controla bodega, consumos y costos operacionales de grúas.

## 7) Flujos Principales (User Journeys)

### 7.1 Alta y gestión de cliente

1. Crear cliente (empresa/aseguradora/persona natural).
2. Agregar vehículos del cliente desde catálogo.
3. Configurar condiciones de cierre (periodo, emails, folio).
4. Editar cliente desde el detalle.

### 7.2 Gestión de servicio (orden)

1. Crear servicio (pendiente, puede no tener asignación inicial).
2. Asignar grúa y operador.
3. Cambiar a “en curso”.
4. Completar servicio.
5. Registrar costos asociados (servicio u operacional) y consumos de bodega.

### 7.3 Cierre y facturación por cliente

1. Crear cierre por cliente y período.
2. Seleccionar servicios completados.
3. Enviar cierre.
4. Registrar folio cliente.
5. Registrar factura (SII) y marcar facturado.
6. Registrar pago.

### 7.4 Órdenes de compra (OC)

1. Crear OC del cliente (subir PDF opcional).
2. Vincular ejecución mediante servicios cuyo `folio_cliente` coincide con el número OC del cliente.
3. Seguir estado (recibida → en ejecución → facturada/anulada).

### 7.5 Importadores

- Excel: cargar clientes, costos, bodega, servicios (según plantillas).
- XML DTE: extraer datos y registrar costo asociado con enlace al documento.
- PDF: extraer campos de OC para pre-llenar formularios.

## 8) Requerimientos Funcionales por Módulo

### 8.1 Clientes (Prompt 01)

- CRUD de clientes, con validación de RUT y tipos.
- Manejo de vehículos del cliente (patente + catálogo).
- Configuración de período de cierre y emails.
- Acciones: ver historial de cambios, crear orden desde cliente.

Archivos relevantes:
- [cliente-form.tsx](file:///Users/sergioiriartevasquez/Desktop/gruapro-chile/src/components/clientes/cliente-form.tsx)
- [_app.clientes.index.tsx](file:///Users/sergioiriartevasquez/Desktop/gruapro-chile/src/routes/_app.clientes.index.tsx)
- [_app.clientes.$clienteId.tsx](file:///Users/sergioiriartevasquez/Desktop/gruapro-chile/src/routes/_app.clientes.$clienteId.tsx)

### 8.2 Vehículos catálogo (Prompt 02)

- CRUD de catálogo, con filtros por marca/modelo/año/tipo.

### 8.3 Grúas (Prompt 03)

- CRUD de grúas con estado operativo.
- Indicadores básicos y enlaces a órdenes asociadas.

### 8.4 Operadores (Prompt 04)

- CRUD de operadores (contrato, licencia, estado).
- Vista detalle con liquidación/comisiones y costos asociados.

### 8.5 Órdenes de servicio (Prompt 05)

- Listado filtrable por cliente, estado, fecha, tipo y texto libre.
- Crear servicio en estado pendiente sin necesidad de asignación inicial.
- Cambios de estado controlados: pendiente ↔ en curso → completado; anulación con validaciones.
- Detalle del servicio: datos, historial, costos asociados, vínculo a cierre y fotos (backlog).

### 8.6 Costos (Prompt 06)

- Registrar costos:
  - **servicio:** asociado a una orden
  - **operacional:** gastos generales/grúa
- Importación por Excel y XML DTE.
- Gestión de categorías/subcategorías y proveedores (parcial según implementación actual).

### 8.7 Bodega (Prompt 07)

- Ítems con stock mínimo y stock actual.
- Movimientos (entrada/salida/ajuste) y **stock derivado** vía trigger.
- Alertas de bajo stock.
- “Registrar compra” orquestado (backlog si se decide implementar el servicio dedicado).

### 8.8 Cotizaciones (Prompt 08)

- Crear cotización por cliente con líneas y totales (IVA incluido/no).
- Estados: borrador/enviada/aprobada/rechazada/vencida/facturada.
- Exportación PDF y duplicado.
- Generar OC desde cotización (flujo integrado).

### 8.9 Órdenes de compra (Prompt 09)

- Crear OC con datos básicos y PDF opcional.
- Ver ejecución vinculando servicios por `folio_cliente`.
- Historial de cambios.
- Campo “condición de pago” (backlog si se desea alineación completa con prompt).

### 8.10 Cierres (Prompt 10)

- Crear cierre por cliente/período y asociar servicios completados.
- Estados: abierto → enviado → con_folio → facturado → pagado (con anulación).
- Registro de folio cliente, factura y pago.
- Exportación PDF del cierre.

### 8.11 Dashboard (Prompt 11)

- KPIs operacionales y financieros: servicios recientes, cierres activos, comisiones pendientes, costos del mes.
- Alertas: bajo stock, cierres atrasados, pendientes de facturación/pago.

### 8.12 Importadores (Prompt 12)

- Excel: plantillas y carga según configuración.
- XML DTE: parseo de XML y registro del costo.
- PDF: extracción de campos de OC para pre-llenado.

## 9) Reglas de Negocio (Resumen)

- El estado de un servicio debe existir y ser consistente con constraints de BD.
- No se debe anular un servicio incluido en cierre activo.
- La facturación por cliente debe consolidarse mediante cierres; el estado `facturado` se deriva de cierres/factura.
- Stock de bodega no se edita manualmente; se deriva de movimientos.
- Auditoría: cambios relevantes deben registrarse en historial.

## 10) Requerimientos No Funcionales

- **Seguridad:** RLS habilitado, claves secretas no se exponen en frontend.
- **Performance:** listados deben soportar crecimiento (paginación server-side como meta).
- **Disponibilidad:** la app debe funcionar con Supabase directo.
- **Trazabilidad:** historial de cambios accesible para usuarios autenticados.
- **DX:** proyecto soporta `pnpm dev` y `pnpm build` sin errores.

## 11) Integraciones y Dependencias

- **Supabase:** Postgres + RLS + Storage + Realtime.
- **Storage buckets principales:**
  - `oc-clientes` (PDFs de OC)
  - `documentos-xml` (XMLs DTE importados)
  - `fotos-servicios` (backlog si se implementa el flujo de fotos)
- **Importación:**
  - `xlsx` para Excel
  - `fast-xml-parser` para XML DTE
  - `pdfjs-dist` para extraer texto de PDF
  - `jspdf` para generación de PDFs en UI

## 12) Métricas de Éxito

- Tiempo promedio de crear una orden (minutos) antes vs después.
- % de órdenes con costos asociados correctamente.
- % de cierres generados sin ajustes manuales posteriores.
- Reducción de reprocesos por datos inconsistentes (incidentes/semana).

## 13) Seed / Demo Data

Existe un seed operativo idempotente para entornos de demo/desarrollo:

- [demo_seed_operativo.sql](file:///Users/sergioiriartevasquez/Desktop/gruapro-chile/supabase/migrations/demo_seed_operativo.sql)

Este seed permite navegar los módulos con datos coherentes: clientes, vehículos, grúas, operadores, órdenes, costos, bodega, cotizaciones, OC, cierres e historial.

## 14) Criterios de Aceptación (Operatividad)

- Crear/editar cliente y asociar vehículo.
- Crear orden pendiente sin asignación, asignar, iniciar y completar.
- Registrar costo asociado a orden y costo operacional.
- Crear cierre con servicios completados, registrar factura y pago.
- Crear cotización y ver totales correctos, cambiar estado y ver historial.
- Crear OC con PDF opcional y ver servicios ejecutados por `folio_cliente`.
- Importar costos por XML y ver documento accesible.
- Ver historial de cambios en módulos clave con usuario autenticado.

## 15) Riesgos y Mitigaciones

- **Riesgo:** divergencia entre UI y constraints reales.  
  **Mitigación:** enums y validaciones centralizadas; migraciones como fuente de verdad.
- **Riesgo:** permisos RLS bloquean flujos operativos.  
  **Mitigación:** políticas explícitas para `service_change_history` y buckets necesarios.
- **Riesgo:** listados grandes sin paginación.  
  **Mitigación:** mover filtros/paginación a server-side progresivamente.

## 16) Backlog (Alta Prioridad)

- Paginación y filtros server-side para órdenes (Prompt 05).
- Consolidación de realtime manager unificado (Prompt 11) para invalidación global.
- “Registrar compra” orquestado en bodega con servicio dedicado (Prompt 07).
- “Condición de pago” en OC (Prompt 09) si se requiere completitud total.
- Fotos por servicio (`fotos-servicios`) con políticas y UI de carga (Prompt 05).

