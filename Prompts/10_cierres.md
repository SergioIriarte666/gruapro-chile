# Módulo 10 — Cierres de Período
**Sistema de Gestión de Grúas · Claude Code**
> ⚠️ Alta complejidad — leer especificación completa antes de construir.

---

## Integración cruzada

**SSOT del estado:** `cierres.estado` propagado via trigger a `ordenes_servicio`.
**Recibe de:** `ordenes_servicio` (servicios del período), `clientes` (requiere_folio, periodo_cierre)
**Envía a:** `ordenes_servicio` → estado `facturado` (via trigger `on_cierre_estado_change`)
**Trigger activo:** `on_cierre_estado_change` — cierre `facturado` → servicios incluidos → `facturado`. Cierre `anulado` → borra `cierre_servicios` → libera servicios.
**Constraint crítico:** `UNIQUE(orden_id)` en `cierre_servicios` — un servicio no puede estar en dos cierres.

---

## Prompt completo para Claude Code

```
Construye el módulo de Cierres de Período completo.
Es el módulo que permite facturar servicios en bloque al final de cada período.
El contexto del proyecto está en CLAUDE.md.

## Tablas: cierres, cierre_servicios

cierres: id, numero (unique), cliente_id FK, periodo_inicio, periodo_fin,
folio_cliente, folio_fecha_recepcion, folio_vencimiento,
subtotal, iva, total, estado (enum), factura_folio_sii, factura_fecha,
pago_fecha, pago_monto, pago_medio, pago_referencia, timestamps

cierre_servicios: id, cierre_id FK (CASCADE), orden_id FK, monto_aplicado
UNIQUE(orden_id) ← CONSTRAINT CRÍTICO: impide servicio en dos cierres

Estados EN ORDEN: abierto → enviado → con_folio → facturado → pagado
Estado especial: anulado (desde cualquier estado excepto facturado/pagado)

## 1. Tipos TypeScript

- Cierre, CierreCreate, CierreEdit
- CierreConDetalle: Cierre + clientes(nombre,requiere_folio) + cierre_servicios[]
- CierreServicio: id, cierre_id, orden_id, monto_aplicado + ordenes_servicio anidada
- LiquidacionCierre: { folioSii, fechaFactura } — para registrar la factura
- PagoCierre: { fecha, monto, medio, referencia } — para registrar el pago

## 2. Schema Zod

createCierreSchema:
- cliente_id: uuid required
- periodo_inicio: date required
- periodo_fin: date required (debe ser >= periodo_inicio)
- observaciones: string optional

registrarFolioSchema:
- folio_cliente: string required ("El folio del cliente es obligatorio")
- folio_fecha_recepcion: date required
- folio_vencimiento: date required

registrarFacturaSchema:
- factura_folio_sii: string required ("Ingresa el folio del SII")
- factura_fecha: date required

registrarPagoSchema:
- pago_fecha: date required
- pago_monto: number min 0 required
- pago_medio: enum ['transferencia','cheque','efectivo'] required
- pago_referencia: string optional

## 3. Numeración automática de cierres

Al crear → generar CIE-XXXX correlativo.

## 4. API Routes — src/app/api/cierres/

### GET /api/cierres
Joins: clientes(nombre,requiere_folio), COUNT de cierre_servicios.
Filtros: estado, cliente_id, periodo (mes/año), page, limit.

### GET /api/cierres/[id]
Query completa:
  supabase.from('cierres')
    .select(`*, clientes(nombre,rut,requiere_folio,iva_incluido),
             cierre_servicios(*, ordenes_servicio(
               folio_interno, folio_cliente, folio_siniestro,
               tipo_servicio, monto, fecha_servicio,
               clientes_vehiculos(patente, vehiculos_catalogo(marca,modelo)),
               operadores(nombre)
             ))`)
    .eq('id', id).single()

### POST /api/cierres — Crear cierre y agregar servicios

PASO 1: Validar y crear el cierre:
  INSERT en cierres con estado='abierto'

PASO 2: Cargar servicios disponibles del período:
  supabase.from('ordenes_servicio')
    .select('id,folio_interno,folio_cliente,tipo_servicio,monto,fecha_servicio,
             clientes_vehiculos(patente,vehiculos_catalogo(marca,modelo))')
    .eq('cliente_id', cliente_id)
    .eq('estado', 'completado')
    .gte('fecha_servicio', periodo_inicio)
    .lte('fecha_servicio', periodo_fin)
    // Excluir los que ya están en un cierre activo:
    .not('id', 'in', `(
      SELECT orden_id FROM cierre_servicios cs
      JOIN cierres c ON c.id = cs.cierre_id
      WHERE c.estado NOT IN ('anulado')
    )`)
Retornar lista de servicios disponibles para que el usuario seleccione.

PASO 3: Agregar servicios seleccionados:
POST /api/cierres/[id]/servicios
Body: { orden_ids: string[] }
  INSERT INTO cierre_servicios (cierre_id, orden_id, monto_aplicado)
  Calcular subtotal/iva/total y UPDATE cierres.
  Si falla por UNIQUE constraint → { error: 'El servicio [folio] ya está en otro cierre' }

### PUT /api/cierres/[id]/estado — ENDPOINT PRINCIPAL DE FLUJO

Maneja todas las transiciones de estado:

→ 'enviado':
  Solo desde 'abierto'. Verificar que tiene al menos 1 servicio.
  UPDATE estado='enviado'. Auditoría.

→ 'con_folio':
  Validar registrarFolioSchema (body).
  VERIFICAR si cliente.requiere_folio = true → folio_cliente es obligatorio.
  UPDATE estado='con_folio' + folio_cliente + folio_fecha_recepcion + folio_vencimiento.

→ 'facturado':
  REGLA CRÍTICA: Si cliente.requiere_folio = true Y folio_cliente IS NULL:
    → { error: 'Este cliente requiere folio para facturar. Registra el folio primero.' }
  Validar registrarFacturaSchema (body).
  UPDATE estado='facturado' + factura_folio_sii + factura_fecha.
  El trigger on_cierre_estado_change actualiza las órdenes automáticamente.

→ 'pagado':
  Solo desde 'facturado'. Validar registrarPagoSchema.
  UPDATE estado='pagado' + datos de pago. Auditoría.

→ 'anulado':
  Solo si estado IN ('abierto','enviado','con_folio').
  UPDATE estado='anulado'.
  El trigger borra cierre_servicios y libera las órdenes.

### DELETE /api/cierres/[id]/servicios/[orden_id]
Solo si cierre está en estado 'abierto'.
DELETE FROM cierre_servicios WHERE cierre_id=id AND orden_id=orden_id.
Recalcular totales del cierre.

## 5. Servicio para exportar PDF del cierre

src/services/CierrePDFService.ts usando pdf-lib:

generateCierrePDF(cierre: CierreConDetalle): Promise<Uint8Array>

Contenido del PDF:
  1. Membrete empresa (logo, nombre, RUT, dirección — desde config_empresa)
  2. Datos del cliente (nombre, RUT)
  3. Período cubierto
  4. Folio del cliente si existe
  5. Tabla de servicios:
     N° | Folio interno | Folio cliente | Fecha | Tipo | Vehículo | Monto
  6. Subtotal neto, IVA 19%, Total
  7. Condición de pago
  8. Espacio para firma del cliente

## 6. Componentes — src/components/modules/cierres/

### CierresTable
Columnas: N° cierre, Cliente, Período, N° servicios, Total, Folio cliente, Estado (badge), Acciones.
Badge estados: abierto=amarillo, enviado=azul, con_folio=naranja, facturado=teal, pagado=verde, anulado=gris.
Alerta: cierre en 'enviado' hace más de 7 días → badge pulsante rojo.

### CierreWizard — Crear cierre en pasos

PASO 1 — "Cliente y período":
  Select cliente (busca async). Toggle período (mes predeterminado o rango custom).
  Botón "Cargar servicios disponibles".

PASO 2 — "Seleccionar servicios":
  Tabla de servicios disponibles del período con checkboxes.
  Seleccionar todos / deseleccionar todos.
  Totales se calculan en tiempo real al seleccionar/deseleccionar.
  Si no hay servicios disponibles → mensaje "No hay servicios completados sin cierre en este período."

PASO 3 — "Confirmar":
  Resumen: N servicios seleccionados · Subtotal · IVA · Total.
  Botón "Crear cierre".

### CierreDetail — src/app/(dashboard)/cierres/[id]/page.tsx

Header: número, cliente, período, estado con badge prominente.
Barra de progreso del flujo: Abierto → Enviado → Con folio → Facturado → Pagado.
Paso activo resaltado.

Panel lateral derecho según estado:

  Estado 'abierto':
    Botón "Agregar más servicios" (abre selector).
    Botón "Enviar al cliente" → PUT /estado → 'enviado'.

  Estado 'enviado':
    Form: "Registrar folio del cliente"
    Campo: N° folio/OC, fecha recepción, fecha vencimiento.
    Botón "Registrar folio" → PUT /estado → 'con_folio'.
    Alerta si lleva > 7 días en este estado.

  Estado 'con_folio':
    Muestra folio del cliente registrado.
    Form: "Registrar factura SII"
    Campo: N° folio SII, fecha emisión.
    Botón "Registrar factura" → PUT /estado → 'facturado'.
    Botón "Exportar PDF del cierre" → CierrePDFService.generateCierrePDF().

  Estado 'facturado':
    Muestra factura registrada.
    Form: "Registrar pago recibido"
    Campos: fecha, monto, medio de pago, N° referencia.
    Botón "Registrar pago" → PUT /estado → 'pagado'.

  Estado 'pagado':
    Todo cerrado. Resumen completo. Badge verde "✓ Pagado".

  Cualquier estado (excepto facturado/pagado):
    Botón "Anular cierre" (en rojo, con confirmación).

Tabla de servicios incluidos:
  Folio interno | Folio cliente | Fecha | Tipo | Vehículo | Monto
  Clic en fila → navegar a la orden.
  Botón X por fila (solo si estado='abierto') → eliminar servicio del cierre.

Totales al pie: Subtotal neto · IVA 19% · Total.

PESTAÑA "Historial":
  <ChangeHistoryPanel entityType="cierre" entityId={id} />

## 7. Página — src/app/(dashboard)/cierres/page.tsx

Resumen arriba:
  N abiertos · N enviados · N con folio · $XXX por facturar
Tabs: Todos | Abiertos | Enviados | Con folio | Facturados | Pagados
Botón "Nuevo cierre".

## Criterios de aceptación
- [ ] No se puede agregar un servicio que ya está en otro cierre activo
- [ ] Sin folio_cliente no se puede facturar si el cliente requiere_folio=true
- [ ] El trigger actualiza el estado de las órdenes al facturar el cierre
- [ ] El PDF del cierre se genera correctamente con todos los datos
- [ ] Al anular un cierre, los servicios quedan disponibles para otro cierre
- [ ] El flujo de estados funciona correctamente con sus restricciones
- [ ] La alerta de > 7 días en estado 'enviado' aparece en dashboard
```
