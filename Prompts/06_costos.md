# Módulo 06 — Costos
**Sistema de Gestión de Grúas · Claude Code**

---

## Integración cruzada

**SSOT:** `costos` es la tabla canónica de todo egreso del negocio — incluidas las comisiones.
**Recibe de:** `ordenes_servicio` (costos directos), `proveedores` (facturas), `gruas` (costos por vehículo)
**Envía a:** `supplier_payments` (sync bidireccional), `bodega_movimientos` (compras), Dashboard (KPIs de gastos)

**Trigger de BD activo:** `sync_cost_to_payment` — al editar el monto de un costo, actualiza el pago vinculado.
**Flag anti-bucle:** columna `sync_source` en `costos`. Si `sync_source = 'supplier_payment'`, el trigger no dispara.

---

## Prompt completo para Claude Code

```
Construye el módulo de Costos completo.
El contexto del proyecto está en CLAUDE.md.

## Tablas: costos, categorias_costo, subcategorias_costo, proveedores

costos: id, orden_id FK (nullable), grua_id FK (nullable), proveedor_id FK (nullable),
categoria_id FK, subcategoria_id FK, fecha, monto, medio_pago, numero_documento,
descripcion, archivo_url, tipo (enum: servicio/operacional), sync_source (text nullable)

## 1. Tipos TypeScript — src/types/index.ts

- Costo, CostoCreate, CostoEdit
- CostoConDetalle: Costo + joins de categoria, subcategoria, proveedor, grua, orden
- CategoriaCosto: id, nombre, tipo, activa
- SubcategoriaCosto: id, categoria_id, nombre, aplica_a, activa
- Proveedor: id, rut, nombre, email, telefono, giro
- ResumenCostosPorCategoria: { categoria: string, total: number, porcentaje: number }

## 2. Schema Zod — src/lib/validations/costos.ts

createCostoSchema:
- fecha: date string required ("La fecha es obligatoria")
- categoria_id: uuid required ("Selecciona una categoría")
- subcategoria_id: uuid required ("Selecciona una subcategoría")
- monto: number min 0.01 required ("Ingresa el monto")
- medio_pago: enum ['efectivo','transferencia','tarjeta','cheque'] optional
- tipo: enum ['servicio','operacional'] required
- orden_id: uuid optional (requerido si tipo='servicio')
- grua_id: uuid optional
- proveedor_id: uuid optional
- numero_documento: string optional
- descripcion: string optional

## 3. API Routes — src/app/api/costos/

### GET /api/costos
Query params: tipo, categoria_id, grua_id, proveedor_id,
              fecha_desde, fecha_hasta, q, page, limit
Query con joins:
  supabase.from('costos')
    .select(`*, categorias_costo(nombre), subcategorias_costo(nombre),
             proveedores(nombre), gruas(patente), ordenes_servicio(folio_interno)`)
    .order('fecha', { ascending: false })

### GET /api/costos/resumen
Query params: fecha_desde, fecha_hasta
Retorna costos agrupados por categoría:
  supabase.rpc('resumen_costos_por_categoria', { inicio, fin })
  O directo: .select('categoria_id,monto,categorias_costo(nombre)')
  Sumar en cliente y calcular porcentajes.

### POST /api/costos
Validar. Si archivo comprobante incluido:
  upload a Supabase Storage bucket 'comprobantes'
  const path = `comprobantes/${Date.now()}-${file.name}`
  Guardar URL en archivo_url.
INSERT en costos. Auditoría. invalidateAll().

### PUT /api/costos/[id]
IMPORTANTE: Al actualizar monto, el trigger sync_cost_to_payment
actualiza supplier_payments automáticamente. No hacerlo en el frontend.
No incluir sync_source en el UPDATE del frontend.
Auditoría con old_value/new_value. invalidateAll().

### DELETE /api/costos/[id]
Si costo tiene supplier_payment vinculado → advertir y pedir confirmación.
Auditoría. invalidateAll().

## 4. API Routes — src/app/api/proveedores/

### GET, POST, PUT, DELETE estándar para proveedores
Incluir en GET: count de costos por proveedor.

## 5. API Routes — src/app/api/categorias-costo/

### GET /api/categorias-costo?aplica_a=servicio
Retorna categorías + subcategorías filtradas por aplica_a:
  supabase.from('categorias_costo')
    .select('*, subcategorias_costo(*)')
    .eq('activa', true)
  Filtrar subcategorías en cliente según aplica_a.

### POST /api/categorias-costo — crear categoría custom del admin
### PUT /api/categorias-costo/[id] — editar nombre o desactivar

## 6. Componente selector en cascada — src/components/shared/CostoSelector.tsx

Props: tipo ('servicio'|'operacional'), onSelect(categoriaId, subcategoriaId)

Comportamiento:
1. Select Categoría → carga subcategorías del tipo correspondiente
2. Al seleccionar subcategoría → emite onChange
3. Opción "+ Crear categoría" al final (admin only) → abre modal inline

## 7. Componentes — src/components/modules/costos/

### CostosTable
Columnas: Fecha, Categoría → Subcategoría, Proveedor, Grúa, Orden vinculada,
Monto, Medio pago, Comprobante (ícono PDF/foto), Acciones.
Filtros: tipo (servicio/operacional), categoría, grúa, fecha range.

### CostoForm
Selector tipo (servicio/operacional) primero → filtra categorías.
CostoSelector para categoría y subcategoría.
Si tipo=servicio → mostrar select de orden (búsqueda por folio).
Upload comprobante: foto o PDF.

### ResumenCostos — tab o sección aparte
Gráfico barras horizontales (Recharts) por categoría del período.
Total costos vs total ingresos → margen neto.
Filtro por período (mes/año).

### CostoDetail (modal o page)
Datos del costo + previsualización del comprobante.
Si tiene supplier_payment vinculado → mostrar enlace.

## 8. Página — src/app/(dashboard)/costos/page.tsx

Tabs: Listado | Resumen por categoría
Botón "Nuevo costo"
Selector de período en la parte superior (afecta ambas vistas)

## Criterios de aceptación
- [ ] Selector categoría → subcategoría filtra correctamente por tipo
- [ ] Al editar el monto, supplier_payment se actualiza (verificar via trigger)
- [ ] Upload de comprobante funciona a Supabase Storage
- [ ] El resumen por categoría suma correctamente
- [ ] El dashboard refleja los costos del mes en tiempo real
```
