# Módulo 08 — Cotizaciones
**Sistema de Gestión de Grúas · Claude Code**

---

## Integración cruzada

**Recibe de:** `clientes`, `ordenes_servicio` (para cotizar servicios ya realizados)
**Envía a:** `ordenes_compra` (al aprobarse puede originar una OC), `cierres` (referencia)

---

## Prompt completo para Claude Code

```
Construye el módulo de Cotizaciones completo.
El contexto del proyecto está en CLAUDE.md.

## Tablas: cotizaciones, cotizacion_lineas

cotizaciones: id, numero (unique), cliente_id FK, fecha_emision, fecha_vencimiento,
condicion_pago, subtotal, iva, total, iva_incluido, estado (enum), observaciones

cotizacion_lineas: id, cotizacion_id FK (CASCADE), orden_id FK (nullable),
descripcion, cantidad, precio_unitario, descuento, total_linea

Estados: borrador → enviada → aprobada | rechazada | vencida → facturada

## 1. Tipos TypeScript

- Cotizacion, CotizacionCreate, CotizacionEdit
- CotizacionLinea, CotizacionLineaCreate
- CotizacionConLineas: Cotizacion + cotizacion_lineas[] + clientes(nombre,rut)

## 2. Schema Zod

createCotizacionSchema:
- cliente_id: uuid required
- fecha_vencimiento: date required
- condicion_pago: number min 0 default 0
- iva_incluido: boolean default true
- observaciones: string optional
- lineas: array de { descripcion, cantidad, precio_unitario, descuento?, orden_id? }
  min 1 línea required

## 3. Numeración automática de cotizaciones

Al crear → generar número correlativo:
  supabase.rpc('genera_numero_cotizacion')
  O directo: leer COUNT(*)+1 de cotizaciones, formatear como COT-XXXX.

## 4. Cálculo de totales (en cliente, tiempo real)

Al agregar/editar líneas:
  total_linea = cantidad * precio_unitario * (1 - descuento/100)
  subtotal = SUM(total_lineas)
  iva = iva_incluido ? subtotal * 0.19 : 0
  total = subtotal + iva

## 5. API Routes — src/app/api/cotizaciones/

### GET /api/cotizaciones
Joins: clientes(nombre), ordenes_compra(numero_cliente) cuando existe.
Filtros: estado, cliente_id, fecha range.

### POST /api/cotizaciones
Crear cotización + todas sus líneas en una operación.
Calcular y guardar subtotal/iva/total.
Auditoría. invalidateAll().

### PUT /api/cotizaciones/[id]
Solo si estado='borrador'. Si estado='enviada' → solo permite cambiar estado.
Recalcular totales al actualizar líneas.

### PUT /api/cotizaciones/[id]/estado
Transiciones válidas:
  borrador → enviada (bloquea edición)
  enviada → aprobada | rechazada
  aprobada → (se puede crear OC desde aquí)
  cualquier estado → vencida (automático si fecha_vencimiento < hoy)
Al marcar como 'enviada' → guardar fecha_envio.
Auditoría. invalidateAll().

### POST /api/cotizaciones/[id]/duplicar
Crear nueva cotización en estado 'borrador' con las mismas líneas.
Número nuevo, fecha_emision = hoy.

## 6. Componentes — src/components/modules/cotizaciones/

### CotizacionesTable
Columnas: N° cotización, Cliente, Fecha, Vence, Servicios (N líneas), Total, Estado, OC vinculada.
Badge estados con colores.
Alerta visual si vence en < 2 días y estado='enviada'.

### CotizacionForm
Header: cliente, fecha vencimiento, condición pago, IVA toggle.
Líneas (tabla editable, agregar/quitar):
  Descripción, Orden vinculada (select opcional, busca por folio), Cantidad, Precio, Descuento%, Total línea.
Totales calculados en tiempo real al lado derecho.

### CotizacionDetail
Vista completa de la cotización con sus líneas.
Botones de acción según estado:
  borrador → [Editar] [Enviar al cliente] [Eliminar]
  enviada → [Marcar aprobada] [Marcar rechazada] [Duplicar]
  aprobada → [Crear OC] [Duplicar]
Botón "Exportar PDF" → generar con pdf-lib:
  Membrete de la empresa (desde config_empresa),
  Datos del cliente, tabla de líneas, totales, condición de pago, vigencia.

## 7. Página — src/app/(dashboard)/cotizaciones/page.tsx

Tabs: Todas | Borradores | Enviadas | Aprobadas | Rechazadas
Badge de alerta en tab "Enviadas" con cotizaciones por vencer.

## Criterios de aceptación
- [ ] Los totales se calculan en tiempo real al editar líneas
- [ ] El estado 'enviada' bloquea la edición de líneas
- [ ] El PDF se genera correctamente con membrete de la empresa
- [ ] Las alertas de vencimiento aparecen en el dashboard
- [ ] Se puede duplicar una cotización con un clic
```
