# Módulo 05 — Órdenes de Servicio
**Sistema de Gestión de Grúas · Claude Code**
> ⚠️ Este es el módulo central del sistema — todo se conecta aquí.

---

## Especificaciones

**Tabla Supabase:** `ordenes_servicio`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| folio_interno | text UNIQUE | Generado automáticamente por trigger |
| folio_cliente | text | Folio entregado por el cliente (opcional) |
| folio_siniestro | text | N° de siniestro para aseguradoras (opcional) |
| cliente_id | uuid FK | Cliente solicitante |
| cliente_vehiculo_id | uuid FK | Vehículo del cliente |
| grua_id | uuid FK | Grúa asignada |
| operador_id | uuid FK | Operador asignado |
| tipo_servicio | enum | `remolque_local` / `larga_distancia` / `izaje` / `rescate` / `traslado` |
| origen | text | Dirección de origen |
| destino | text | Dirección de destino |
| estado | enum | `pendiente` / `en_curso` / `completado` / `facturado` / `anulado` |
| monto | numeric | Monto cobrado |
| forma_pago | enum | `efectivo` / `transferencia` / `credito` / `aseguradora` |
| fecha_servicio | timestamptz | Fecha y hora del servicio |
| observaciones | text | Notas |
| fotos | text[] | URLs de fotos en Supabase Storage |
| created_at / updated_at | timestamptz | Automáticos |

---

## Integración cruzada

**Este módulo RECIBE datos de:**
- `clientes` — cliente solicitante del servicio
- `clientes_vehiculos` → `vehiculos_catalogo` — vehículo del cliente
- `gruas` — grúa asignada (solo estado `activa`)
- `operadores` — operador asignado (solo estado `activo`)
- `config_comisiones` — monto de comisión según tipo de servicio

**Este módulo ENVÍA datos a:**
- `comisiones` — al completar → trigger genera comisión automáticamente
- `cierre_servicios` — al incluirse en un cierre mensual
- `costos` — costos directos del servicio (combustible, peajes, etc.)
- `bodega_movimientos` — repuestos usados en el servicio
- Dashboard — KPIs de servicios del período, servicios recientes

**Triggers que ya cubren este módulo (NO reimplementar en frontend):**
- `set_folio_orden` — genera `folio_interno` automáticamente al insertar
- `on_orden_estado_change`:
  - Estado → `completado` + tiene `operador_id` → INSERT en `comisiones`
  - Estado → `anulado` → DELETE de `comisiones` donde `estado = 'pendiente'`

**Propagaciones que sí vienen de otros módulos:**
- `on_cierre_estado_change` — cuando el cierre se factura, actualiza `estado → 'facturado'`

**Reglas de negocio críticas:**
- `folio_interno` se genera por trigger — NO incluir en el INSERT, NO mostrar en el form
- Estado `facturado` solo lo asigna el módulo de cierres — nunca manualmente
- Un servicio no puede estar en dos cierres simultáneamente (constraint UNIQUE en `cierre_servicios.orden_id`)
- Al anular: si tiene comisión pendiente, el trigger la elimina automáticamente

**Invalidación de React Query al escribir:**
```ts
const { invalidateAll } = useUniversalSync()
await invalidateAll()
// Query keys: ['ordenes'], ['comisiones'], ['dashboard']
```

---

## Prompt completo para Claude Code

```
Construye el módulo de Órdenes de Servicio completo.
Es el módulo central del sistema — todo se conecta aquí.
El contexto del proyecto está en CLAUDE.md.

## Tabla: ordenes_servicio (ya existe en Supabase)
Campos según especificación técnica.
CRÍTICO: folio_interno se genera por trigger al insertar. NO incluir en INSERT.

## 1. Tipos TypeScript — src/types/index.ts

Agregar:
- OrdenServicio: tipo base completo con todos los campos
- OrdenCreate: sin id, sin folio_interno, sin timestamps
- OrdenEdit: todo opcional excepto id. NO incluir folio_interno (no editable)
- OrdenListItem: id, folio_interno, folio_cliente, tipo_servicio, monto, estado,
                 fecha_servicio + clientes(nombre) + gruas(patente) + operadores(nombre)
- OrdenDetalle: OrdenServicio + joins completos de todas las tablas relacionadas

## 2. Schema Zod — src/lib/validations/ordenes.ts

createOrdenSchema:
- cliente_id: uuid required ("Selecciona un cliente")
- cliente_vehiculo_id: uuid optional
- grua_id: uuid optional
- operador_id: uuid optional
- tipo_servicio: enum required ("Selecciona el tipo de servicio")
- origen: string max 300 optional
- destino: string max 300 optional
- monto: number min 0 required ("Ingresa el monto del servicio")
- forma_pago: enum required ("Selecciona la forma de pago")
- fecha_servicio: datetime string, default NOW()
- folio_cliente: string optional
- folio_siniestro: string optional
- observaciones: string optional

editOrdenSchema: mismo con .partial() excepto id.
NO incluir folio_interno en ninguno de los dos schemas.

cambiarEstadoSchema:
- estado: enum ['pendiente','en_curso','completado','anulado'] required
  (NO incluir 'facturado' — ese lo asigna el módulo de cierres)

## 3. API Routes — src/app/api/ordenes/

### GET /api/ordenes
Query params: estado, tipo_servicio, cliente_id, grua_id, operador_id,
              fecha_desde, fecha_hasta, q (busca en folio_interno y folio_cliente),
              page, limit
Query con todos los joins:
  supabase.from('ordenes_servicio')
    .select(`
      id, folio_interno, folio_cliente, tipo_servicio, monto, estado, fecha_servicio,
      clientes(id, nombre),
      gruas(id, patente, marca, modelo),
      operadores(id, nombre),
      clientes_vehiculos(patente, vehiculos_catalogo(marca, modelo, anio))
    `, { count:'exact' })
    .order('fecha_servicio', { ascending: false })
    .range(offset, offset+limit-1)

### POST /api/ordenes
Validar con createOrdenSchema.
NO incluir folio_interno en el INSERT (el trigger lo genera).
INSERT en ordenes_servicio.
Auditoría: service_change_history { action:'created' }.
invalidateAll().

### GET /api/ordenes/[id]
Query completa con todos los joins + costos + comision + cierre:
  supabase.from('ordenes_servicio')
    .select(`
      *,
      clientes(*),
      clientes_vehiculos(*, vehiculos_catalogo(*)),
      gruas(*),
      operadores(*),
      costos(*, categorias_costo(nombre), subcategorias_costo(nombre)),
      comisiones(*),
      cierre_servicios(cierres(numero, estado, periodo_inicio, periodo_fin))
    `)
    .eq('id', id).single()

### PUT /api/ordenes/[id]
Validar con editOrdenSchema.
NO permitir cambiar folio_interno.
NO permitir cambiar estado a 'facturado' (solo el módulo de cierres puede hacerlo).
Si se cambia estado → usar cambiarEstadoSchema separado.
UPDATE. Auditoría con old_value/new_value. invalidateAll().

### PUT /api/ordenes/[id]/estado
Body: { estado: 'pendiente'|'en_curso'|'completado'|'anulado' }
Validaciones según estado destino:
  → 'completado': verificar que tiene grua_id y operador_id asignados
  → 'anulado': verificar que no está en un cierre activo
    (SELECT FROM cierre_servicios WHERE orden_id=id AND cierres.estado != 'anulado')
    Si está → { error: 'No se puede anular una orden incluida en un cierre activo' }
UPDATE estado. El trigger hace el resto (comisión).
Auditoría { action:'estado_changed', old_value:{estado:old}, new_value:{estado:new} }.
invalidateAll().

### POST /api/ordenes/[id]/fotos
Upload de fotos a Supabase Storage:
  const path = `servicios/${id}/${Date.now()}-${file.name}`
  await supabase.storage.from('fotos-servicios').upload(path, file)
Agregar URL al array fotos[] de la orden:
  UPDATE ordenes_servicio SET fotos = array_append(fotos, url) WHERE id=id
Retornar { url }

## 4. Componentes — src/components/modules/ordenes/

### OrdenesTable
Columnas: Folio interno, Folio cliente, Cliente, Vehículo (marca+patente),
Tipo (badge), Operador, Monto, Estado (badge color), Fecha, Acciones.
Badges de estado:
  pendiente=amarillo, en_curso=azul, completado=verde, facturado=teal, anulado=gris
Filtros:
  - Búsqueda por folio (interno o cliente)
  - Select de estado
  - Select de tipo de servicio
  - Date range (fecha desde / hasta)
  - Select de cliente (búsqueda async)
Paginación de 20 registros.

### OrdenForm — FORMULARIO EN PASOS (wizard de 3 pasos)

PASO 1 — "Cliente y vehículo":
  a. Buscar cliente (input con búsqueda async por nombre o RUT):
     supabase.from('clientes').select('id,nombre,rut').ilike('nombre','%q%')
  b. Al seleccionar cliente → cargar sus vehículos:
     supabase.from('clientes_vehiculos')
       .select('id,patente,vehiculos_catalogo(marca,modelo,anio)')
       .eq('cliente_id', clienteId)
     Select: "Toyota Hilux 2021 · CDKP21"
  c. Link "Agregar vehículo nuevo" → VehiculoSelector en modo creación

PASO 2 — "Asignación":
  a. Select de grúa (solo activas):
     supabase.from('gruas').select('id,patente,marca,modelo,tipo_grua')
       .eq('estado','activa')
     Mostrar: "BBTX21 · Toyota Hilux · Plataforma"
  b. Select de operador (solo activos):
     supabase.from('operadores').select('id,nombre').eq('estado','activo')
  c. Mostrar badge de comisión que se generará:
     "Al completar → comisión de $8.000 para el operador"
     (leer de config_comisiones según tipo_servicio)

PASO 3 — "Datos del servicio":
  tipo_servicio*, fecha_servicio*, monto*, forma_pago*,
  origen, destino, folio_cliente, folio_siniestro, observaciones

  NOTA visible en el formulario:
  "El folio interno se genera automáticamente al crear la orden."

### OrdenModal: modal que contiene OrdenForm (ancho grande, 3 columnas en desktop)

### OrdenDetail — src/app/(dashboard)/ordenes/[id]/page.tsx
Header:
  - Folio interno grande y destacado (solo lectura, nunca editable)
  - Folio cliente (editable inline si no está facturada)
  - Badge de estado con botones de cambio de estado
  - Monto destacado

Botones de cambio de estado (según estado actual):
  pendiente → [Iniciar servicio] [Anular]
  en_curso → [Completar servicio] [Anular]
  completado → [Anular]
  facturado → (sin botones — solo lo puede cambiar el cierre)
  anulado → (sin botones)

PESTAÑA "Servicio":
  Datos completos: cliente, vehículo, grúa, operador, tipo, origen, destino,
  fecha, monto, forma de pago, observaciones.
  Botón "Editar" (si no está facturado ni anulado).
  Galería de fotos + botón "Agregar foto".

PESTAÑA "Costos directos":
  Costos vinculados a esta orden (costos.orden_id = id).
  Query: supabase.from('costos')
         .select('*, categorias_costo(nombre), subcategorias_costo(nombre)')
         .eq('orden_id', id)
  Formulario inline para agregar costo directo al servicio:
    categoría, subcategoría, monto, descripción.
  Total de costos directos vs monto del servicio → margen.

PESTAÑA "Comisión":
  Query: supabase.from('comisiones').select('*').eq('orden_id', id).single()
  Si existe → mostrar monto, estado, fecha de pago.
  Si no existe y el estado es 'completado' → botón "Generar comisión manualmente"
    (solo admin, útil para casos donde el trigger falló)
  Si estado = 'pagado' → mostrar en verde, sin opción de editar.

PESTAÑA "Cierre":
  Query: supabase.from('cierre_servicios')
         .select('cierres(numero,estado,periodo_inicio,periodo_fin,clientes(nombre))')
         .eq('orden_id', id).single()
  Si está en un cierre → mostrar enlace al cierre.
  Si no está → "Esta orden no ha sido incluida en ningún cierre aún."

PESTAÑA "Historial":
  <ChangeHistoryPanel entityType="orden" entityId={id} />

## 5. Página listado — src/app/(dashboard)/ordenes/page.tsx

- Resumen arriba: N pendientes · N en curso · $XXX.XXX del mes
- Tabs de filtro rápido: Todas | Pendientes | En curso | Completadas | Facturadas
- Botón "Nueva orden"
- OrdenesTable con todos los filtros

## 6. Verificación de consistencia — src/hooks/services/useAdvancedServiceSync.ts

Implementar para este módulo:

verifyConsistency(ordenId):
  Check 1: orden completada con operador pero sin comisión → 'missing_commission'
  Check 2: servicio en cierre facturado pero estado != 'facturado' → 'estado_desfasado'
  Check 3: orden anulada con comisión activa → 'comision_huerfana'

autoRepair(ordenId):
  Resolver cada issue según su tipo.
  Registrar en service_change_history.
  invalidateAll().

## Criterios de aceptación

- [ ] Compila sin errores TypeScript
- [ ] folio_interno aparece solo en lectura, nunca en formulario de creación
- [ ] El selector de cliente → vehículo funciona en cascada
- [ ] Al completar una orden, la comisión se genera automáticamente (verificar en Supabase)
- [ ] No se puede cambiar estado a 'facturado' desde el formulario
- [ ] No se puede anular una orden incluida en un cierre activo
- [ ] Las fotos se suben a Supabase Storage correctamente
- [ ] El margen (monto - costos directos) se calcula en tiempo real
- [ ] verifyConsistency() detecta los 3 tipos de issues
```
