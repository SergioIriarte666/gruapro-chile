# Módulo 07 — Bodega e Inventario
**Sistema de Gestión de Grúas · Claude Code**

---

## Integración cruzada

**SSOT:** `bodega_items.stock_actual` — NUNCA UPDATE directo. Siempre via `bodega_movimientos`.
**Recibe de:** `proveedores` (compras), `UnifiedPurchaseService` (orquesta compra completa)
**Envía a:** `ordenes_servicio` (repuestos usados en campo), `gruas` (mantenciones), `costos` (gasto de compra)

---

## Prompt completo para Claude Code

```
Construye el módulo de Bodega e Inventario completo.
El contexto del proyecto está en CLAUDE.md.

## Tablas: bodega_items, bodega_movimientos

bodega_items: id, nombre, subcategoria_id FK, proveedor_id FK,
stock_actual, stock_minimo, precio_costo, unidad, ubicacion

bodega_movimientos: id, item_id FK, orden_id FK (nullable), grua_id FK (nullable),
tipo (enum: entrada/salida/ajuste), cantidad, fecha, descripcion

REGLA CRÍTICA: stock_actual NUNCA se actualiza directamente.
Solo se modifica al insertar en bodega_movimientos.
Crear trigger en Supabase:
  AFTER INSERT ON bodega_movimientos:
  - tipo='entrada' → stock_actual += cantidad
  - tipo='salida'  → stock_actual -= cantidad
  - tipo='ajuste'  → stock_actual = cantidad (valor absoluto)
  Verificar que stock_actual no quede negativo en salidas.

## 1. Tipos TypeScript — src/types/index.ts

- BodegaItem, BodegaItemCreate, BodegaItemEdit
- BodegaItemConAlerta: BodegaItem + { bajoStock: boolean, proveedor: Proveedor }
- BodegaMovimiento: id, item_id, orden_id, grua_id, tipo, cantidad, fecha, descripcion
- BodegaMovimientoConDetalle: + bodega_items(nombre) + ordenes_servicio(folio_interno) + gruas(patente)

## 2. Schema Zod — src/lib/validations/bodega.ts

createItemSchema:
- nombre: string required
- subcategoria_id: uuid optional
- proveedor_id: uuid optional
- stock_minimo: number min 0 default 0
- precio_costo: number min 0 default 0
- unidad: string default 'unidad'
- ubicacion: string optional
(stock_actual no va en el form de creación — empieza en 0, sube con movimientos)

createMovimientoSchema:
- item_id: uuid required
- tipo: enum required
- cantidad: number min 0.01 required
- fecha: date required
- grua_id: uuid optional
- orden_id: uuid optional
- descripcion: string optional

## 3. API Routes — src/app/api/bodega/

### GET /api/bodega/items
Query params: q, bajo_stock (boolean), proveedor_id, page, limit
  supabase.from('bodega_items')
    .select('*, proveedores(nombre), subcategorias_costo(nombre,categorias_costo(nombre))')
  Si bajo_stock=true → filtrar donde stock_actual < stock_minimo

### POST /api/bodega/items — crear ítem (stock empieza en 0)
### PUT /api/bodega/items/[id] — editar datos (excepto stock_actual directo)
### GET /api/bodega/items/[id]/movimientos — historial de movimientos del ítem

### POST /api/bodega/movimientos
Validar con createMovimientoSchema.
Si tipo='salida' y cantidad > stock_actual → error:
  { error: 'Stock insuficiente. Disponible: N unidades', field: 'cantidad' }
INSERT en bodega_movimientos.
El trigger actualiza stock_actual automáticamente.
Auditoría. invalidateAll().

### GET /api/bodega/alertas
Items donde stock_actual < stock_minimo:
  supabase.from('bodega_items')
    .select('id,nombre,stock_actual,stock_minimo,unidad')
    .filter('stock_actual','lt','stock_minimo')
Usado por el dashboard y el panel de alertas.

## 4. Servicio orquestador para compra completa
Importar y usar UnifiedPurchaseService (ya existe en src/services/).
Este módulo NO implementa su propio servicio de compra.
El formulario de "Registrar compra" llama a UnifiedPurchaseService.registerPurchase().

## 5. Componentes — src/components/modules/bodega/

### BodegaTable
Columnas: Nombre, Categoría, Stock actual (resaltado en rojo si bajo mínimo),
Stock mínimo, Unidad, Precio costo, Proveedor, Ubicación, Acciones.
Filtro: búsqueda, toggle "Solo bajo stock".
Badge rojo en stock si stock_actual < stock_minimo.

### MovimientoForm
Tipo (entrada/salida/ajuste), ítem (select buscable), cantidad,
fecha, grúa asociada (optional), orden asociada (optional), descripción.

### CompraForm — formulario de compra completa
Llama a UnifiedPurchaseService.registerPurchase():
  ítem (nuevo o existente), cantidad, precio unitario, proveedor,
  N° factura, fecha, consumo inmediato (toggle), grúa (si consumo inmediato).

### BodegaItemDetail
Al hacer clic en un ítem → modal con:
  Datos del ítem (editable).
  Historial de movimientos (tabla cronológica).
  Gráfico de stock en el tiempo (Recharts LineChart).

### AlertasBodegaWidget — para el dashboard
  Lista de ítems bajo stock mínimo con botón "Registrar compra".

## 6. Página — src/app/(dashboard)/bodega/page.tsx

Tabs: Inventario | Movimientos
Contador de alertas en el tab Inventario (badge rojo con N ítems bajo mínimo).
Botones: "Nuevo ítem" y "Registrar movimiento" y "Registrar compra".

## Criterios de aceptación
- [ ] stock_actual NUNCA se actualiza directamente (solo via movimientos)
- [ ] El trigger de actualización de stock funciona correctamente
- [ ] No se puede registrar salida mayor al stock disponible
- [ ] Las alertas de stock bajo aparecen en el dashboard
- [ ] La compra completa (via UnifiedPurchaseService) crea costo + movimiento
```
