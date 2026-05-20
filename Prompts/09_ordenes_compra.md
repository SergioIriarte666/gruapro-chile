# Módulo 09 — Órdenes de Compra (OC)
**Sistema de Gestión de Grúas · Claude Code**

---

## Integración cruzada

**Recibe de:** `cotizaciones` (OC puede originarse de una cotización aprobada), `clientes`
**Envía a:** `cierres` (una OC puede cubrir el cierre), `ordenes_servicio` (servicios ejecutados bajo esta OC)

---

## Prompt completo para Claude Code

```
Construye el módulo de Órdenes de Compra (OC del cliente) completo.
El contexto del proyecto está en CLAUDE.md.

## Tabla: ordenes_compra

id, numero_interno (unique), numero_cliente, cliente_id FK, cotizacion_id FK (nullable),
fecha_recepcion, monto_total, monto_ejecutado, estado (enum), archivo_pdf_url

Estados: recibida → en_ejecucion → parcialmente_facturada → facturada | anulada

## 1. Tipos TypeScript

- OrdenCompra, OrdenCompraCreate, OrdenCompraEdit
- OrdenCompraConDetalle: + clientes(nombre), cotizaciones(numero) si existe

## 2. Schema Zod

createOCSchema:
- cliente_id: uuid required
- numero_cliente: string optional (N° de OC que puso el cliente)
- cotizacion_id: uuid optional
- fecha_recepcion: date default hoy
- monto_total: number min 0 required
- condicion_pago: integer default 30

## 3. Numeración interna automática

Al crear → generar OC-XXXX correlativo (similar a cotizaciones).

## 4. API Routes — src/app/api/ordenes-compra/

### GET /api/ordenes-compra
Joins: clientes(nombre), cotizaciones(numero).
Filtros: estado, cliente_id, fecha range.
Calcular monto_ejecutado = SUM de ordenes_servicio vinculadas a esta OC (via folio_cliente).

### POST /api/ordenes-compra
Si cotizacion_id → marcar cotización como 'facturada'.
Si archivo PDF adjunto → upload a Supabase Storage bucket 'oc-clientes'.
INSERT. Auditoría. invalidateAll().

### PUT /api/ordenes-compra/[id]
Actualizar datos. Recalcular monto_ejecutado.
No permitir editar si estado='facturada'.

### PUT /api/ordenes-compra/[id]/estado
Transiciones válidas según estado actual.
Auditoría. invalidateAll().

## 5. Lector de PDF de OC — integración con PDFImportService

Al subir PDF de OC del cliente:
Usar pdf-lib + pdfjs-dist para extraer texto.
Mostrar preview con campos extraídos:
  - N° OC del cliente
  - Nombre del cliente (para verificar)
  - Monto total
  - Fecha de emisión
  - Condición de pago
Nivel de confianza por campo (verde/amarillo/rojo).
Usuario confirma antes de guardar.

## 6. Componentes — src/components/modules/ordenes-compra/

### OCTable
Columnas: N° interno, N° OC cliente, Cliente, Cotización origen, Fecha, Monto total,
Monto ejecutado (barra de progreso), Saldo disponible, Estado.

### OCForm
Cliente, número cliente, cotización origen (select opcional), fecha recepción,
monto total, condición pago.
Upload PDF de la OC del cliente.

### OCDetail
Header: ambos números (interno y cliente), monto total vs ejecutado, saldo.
Lista de servicios ejecutados bajo esta OC:
  supabase.from('ordenes_servicio')
    .select('folio_interno,folio_cliente,tipo_servicio,monto,estado,fecha_servicio')
    .eq('folio_cliente', oc.numero_cliente)  // o join via tabla intermedia

## Criterios de aceptación
- [ ] La barra de progreso monto ejecutado vs total es correcta
- [ ] El PDF se sube a Supabase Storage y es descargable
- [ ] La extracción de datos del PDF muestra preview con confianza
- [ ] Al crear desde una cotización, la cotización queda como 'facturada'
```
