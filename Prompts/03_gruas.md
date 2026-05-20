# Módulo 03 — Grúas (Flota)
**Sistema de Gestión de Grúas · Claude Code**

---

## Especificaciones

**Tabla Supabase:** `gruas`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| patente | text UNIQUE NOT NULL | Patente del vehículo |
| marca | text | Marca |
| modelo | text | Modelo |
| anio | integer | Año |
| tipo_grua | enum | `plataforma` / `pluma` / `portacontenedor` / `otro` |
| estado | enum | `activa` / `en_mantencion` / `baja` |
| foto_url | text | URL foto en Supabase Storage |
| fecha_incorporacion | date | Fecha de ingreso a la flota |
| created_at / updated_at | timestamptz | Automáticos |

---

## Integración cruzada

**Este módulo RECIBE datos de:**
- `bodega_movimientos` — repuestos consumidos en mantenciones de esta grúa
- `costos` — gastos asociados a esta grúa (combustible, mantenciones, seguros)

**Este módulo ENVÍA datos a:**
- `ordenes_servicio` — `grua_id` en cada orden ejecutada
- `costos` — `grua_id` opcional en gastos operacionales
- `bodega_movimientos` — `grua_id` en salidas de bodega para mantención
- Dashboard — widget de estado de flota (activa / en_mantencion / baja)

**Reglas de negocio:**
- Solo grúas con `estado = 'activa'` aparecen disponibles al crear una orden
- El estado `en_mantencion` bloquea la grúa temporalmente
- No se puede dar de baja una grúa con órdenes activas (`estado IN ('pendiente','en_curso')`)

**Invalidación de React Query al escribir:**
```ts
const { invalidateAll } = useUniversalSync()
await invalidateAll()
// Query keys específicas: ['gruas'], ['dashboard']
```

---

## Prompt completo para Claude Code

```
Construye el módulo de Grúas (Flota) completo.
El contexto del proyecto está en CLAUDE.md.

## Tabla: gruas (ya existe en Supabase)
id, patente (unique), marca, modelo, anio, tipo_grua (enum),
estado (enum: activa/en_mantencion/baja), foto_url, fecha_incorporacion, timestamps

## 1. Tipos TypeScript — src/types/index.ts

Agregar:
- Grua: tipo base completo
- GruaCreate: sin id ni timestamps
- GruaEdit: todo opcional excepto id
- GruaListItem: id, patente, marca, modelo, anio, tipo_grua, estado
- GruaConEstadisticas: Grua + { totalServicios, totalCostos, proximaMantención }

## 2. Schema Zod — src/lib/validations/gruas.ts

createGruaSchema:
- patente: string min 6 max 8, uppercase, required ("La patente es obligatoria")
- marca: string optional
- modelo: string optional
- anio: number min 1990 max 2030, optional
- tipo_grua: enum ['plataforma','pluma','portacontenedor','otro'] required
- estado: enum ['activa','en_mantencion','baja'] default 'activa'
- fecha_incorporacion: date string optional

## 3. API Routes — src/app/api/gruas/

### GET /api/gruas
Query params: estado, q (búsqueda por patente/marca/modelo), page, limit
Query:
  supabase.from('gruas')
    .select('id,patente,marca,modelo,anio,tipo_grua,estado,foto_url', { count:'exact' })
    .order('patente')

### GET /api/gruas/disponibles
Para el selector al crear órdenes — solo activas:
  supabase.from('gruas')
    .select('id,patente,marca,modelo,tipo_grua')
    .eq('estado','activa')
    .order('patente')

### GET /api/gruas/[id]
Query con datos relacionados:
  supabase.from('gruas').select('*').eq('id',id).single()

### POST /api/gruas
Validar. Patente en uppercase. Verificar que no existe la patente.
Si foto incluida → upload a Supabase Storage bucket 'fotos-gruas'.
INSERT. Auditoría. invalidateAll().

### PUT /api/gruas/[id]
Si estado cambia a 'baja' → verificar que no tiene órdenes activas.
UPDATE. Auditoría con old_value/new_value. invalidateAll().

### DELETE /api/gruas/[id]
No permitir si tiene órdenes de servicio (cualquier estado).
→ { error: 'No se puede eliminar una grúa con historial de servicios. Usa el estado Baja.' }

## 4. Componentes — src/components/modules/gruas/

### GruasTable
Columnas: Foto (miniatura), Patente, Marca + Modelo, Año, Tipo, Estado (badge color), Acciones.
Badge colores: activa=verde, en_mantencion=naranja, baja=gris.
Filtros: select de estado, búsqueda por texto.

### GruaForm
Campos organizados:
  Fila 1: patente* (uppercase automático), tipo_grua*, estado*
  Fila 2: marca, modelo, año, fecha_incorporacion
  Foto: upload con preview inmediato
    const { data } = await supabase.storage
      .from('fotos-gruas').upload(patente+'.jpg', file)
    Guardar URL pública en foto_url

### GruaModal: modal estándar crear/editar

### GruaDetail — src/app/(dashboard)/gruas/[id]/page.tsx
Header con foto de la grúa, patente destacada, badge de estado con botón de cambio rápido.

PESTAÑA "Datos":
  Todos los campos en lectura. Botón Editar.

PESTAÑA "Servicios":
  Historial de órdenes donde grua_id = id.
  Query: supabase.from('ordenes_servicio')
         .select('folio_interno,tipo_servicio,monto,estado,fecha_servicio,clientes(nombre)')
         .eq('grua_id', id)
         .order('fecha_servicio', { ascending: false })
         .limit(50)
  Total de servicios y suma de ingresos generados por esta grúa.

PESTAÑA "Costos":
  Query: supabase.from('costos')
         .select('fecha,monto,categorias_costo(nombre),subcategorias_costo(nombre),descripcion')
         .eq('grua_id', id)
         .order('fecha', { ascending: false })
  Agrupados por categoría con subtotales.
  Gráfico de barras (Recharts) de costos por mes.

PESTAÑA "Mantenciones":
  Filtrar costos donde subcategoria = 'preventiva' o 'correctiva'.
  Mostrar fecha, descripción, monto, repuestos usados.
  Query adicional: supabase.from('bodega_movimientos')
    .select('fecha,cantidad,bodega_items(nombre),descripcion')
    .eq('grua_id', id).eq('tipo','salida')

PESTAÑA "Documentos":
  Lista de documentos con fecha de vencimiento:
  - Revisión técnica
  - SOAP
  - Permiso de circulación
  - Seguro de flota
  Mostrar badge ROJO si venció, NARANJA si vence en < 30 días, VERDE si está vigente.
  Estos datos vienen de costos con subcategorías correspondientes.

PESTAÑA "Historial":
  <ChangeHistoryPanel entityType="grua" entityId={id} />

## 5. Página listado — src/app/(dashboard)/gruas/page.tsx

- Tabs de filtro rápido: Todas | Activas | En mantención | Baja
- Tarjetas (grid 3 columnas) con foto, patente, estado y métricas clave
- Botón "Nueva grúa"
- Widget resumen arriba: N activas · N en mantención · N en baja

## 6. Widget de flota para dashboard

Exportar componente FlotaWidget:
  supabase.from('gruas').select('estado')
  Contar por estado → mostrar 3 anillos SVG:
  Verde (activas), Naranja (en mantención), Gris (baja)

## Criterios de aceptación

- [ ] Compila sin errores TypeScript
- [ ] Solo grúas activas aparecen en el selector de órdenes
- [ ] La foto se sube a Supabase Storage y se muestra correctamente
- [ ] Los costos por grúa se calculan correctamente desde la tabla costos
- [ ] No se puede eliminar una grúa con historial
- [ ] El widget de flota refleja el estado real en tiempo real
```
