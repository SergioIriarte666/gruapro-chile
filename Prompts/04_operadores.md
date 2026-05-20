# Módulo 04 — Operadores
**Sistema de Gestión de Grúas · Claude Code**

---

## Especificaciones

**Tabla Supabase:** `operadores`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| rut | text UNIQUE | RUT del operador |
| nombre | text NOT NULL | Nombre completo |
| telefono | text | Teléfono |
| licencia_clase | text | Clase de licencia (A1, A2, A3, A4, A5) |
| licencia_vencimiento | date | Fecha de vencimiento |
| tipo_contrato | enum | `planta` / `honorarios` / `externo` |
| sueldo_base | numeric | Sueldo fijo mensual |
| estado | enum | `activo` / `inactivo` / `vacaciones` |
| created_at / updated_at | timestamptz | Automáticos |

---

## Integración cruzada

**Este módulo RECIBE datos de:**
- `comisiones` — comisiones generadas por sus órdenes completadas
- `config_comisiones` — tabla de montos fijos por tipo de servicio

**Este módulo ENVÍA datos a:**
- `ordenes_servicio` — `operador_id` en cada orden asignada
- `comisiones` — cada orden completada genera una comisión para el operador asignado
- Dashboard — widget de comisiones pendientes por operador

**Triggers que ya cubren este módulo (NO reimplementar en frontend):**
- `on_orden_estado_change` — al completar una orden, genera automáticamente la comisión
  del operador según `config_comisiones`. Al anular, elimina la comisión si está pendiente.

**Reglas de negocio:**
- Solo operadores con `estado = 'activo'` aparecen disponibles al crear una orden
- La comisión se genera automáticamente vía trigger — no se crea manualmente
- Una comisión en estado `pagado` NO puede modificarse
- El monto de comisión se congela en el momento de generarse (aunque cambie `config_comisiones`)

**Invalidación de React Query al escribir:**
```ts
const { invalidateAll } = useUniversalSync()
await invalidateAll()
// Query keys específicas: ['operadores'], ['comisiones'], ['dashboard']
```

---

## Prompt completo para Claude Code

```
Construye el módulo de Operadores completo, incluyendo la gestión de comisiones.
El contexto del proyecto está en CLAUDE.md.

## Tabla: operadores (ya existe en Supabase)
id, rut (unique), nombre, telefono, licencia_clase, licencia_vencimiento (date),
tipo_contrato (enum: planta/honorarios/externo), sueldo_base, estado (enum), timestamps

## Tabla: comisiones (ya existe en Supabase)
id, orden_id (unique FK), operador_id FK, monto_comision, estado (enum: pendiente/pagado/descontado),
fecha_pago

## Tabla: config_comisiones (ya existe en Supabase)
id, tipo_servicio (unique), monto_comision
(seed ya cargado: remolque_local=8000, larga_distancia=15000, izaje=12000, rescate=10000, traslado=7000)

## 1. Tipos TypeScript — src/types/index.ts

Agregar:
- Operador: tipo base completo
- OperadorCreate: sin id ni timestamps
- OperadorEdit: todo opcional excepto id
- OperadorListItem: id, nombre, rut, telefono, licencia_clase, licencia_vencimiento, estado
- Comision: id, orden_id, operador_id, monto_comision, estado, fecha_pago
- ComisionConDetalle: Comision + ordenes_servicio(folio_interno,tipo_servicio,fecha_servicio)
- ConfigComision: id, tipo_servicio, monto_comision
- LiquidacionOperador: { operadorId, operadorNombre, periodo, servicios: number,
                         totalComisiones: number, estado: 'pendiente'|'pagado' }

## 2. Schema Zod — src/lib/validations/operadores.ts

createOperadorSchema:
- nombre: string min 2 max 200 required ("El nombre es obligatorio")
- rut: string, validar formato chileno, optional
- telefono: string optional
- licencia_clase: enum ['A1','A2','A3','A4','A5'] optional
- licencia_vencimiento: date string optional
- tipo_contrato: enum ['planta','honorarios','externo'] required
- sueldo_base: number min 0 default 0
- estado: enum ['activo','inactivo','vacaciones'] default 'activo'

## 3. API Routes — src/app/api/operadores/

### GET /api/operadores
Query params: estado, q, page, limit
Query con conteo de comisiones pendientes:
  supabase.from('operadores')
    .select('*, comisiones(count)', { count:'exact' })
    .eq('comisiones.estado','pendiente')

### GET /api/operadores/disponibles
Solo activos (para selector en órdenes):
  supabase.from('operadores').select('id,nombre,rut')
    .eq('estado','activo').order('nombre')

### POST /api/operadores
Validar. Verificar rut único. INSERT. Auditoría. invalidateAll().

### PUT /api/operadores/[id]
Si estado cambia → validar que no tiene órdenes activas si se intenta inactivar.
UPDATE. Auditoría. invalidateAll().

### DELETE /api/operadores/[id]
No permitir si tiene comisiones o servicios.
→ { error: 'No se puede eliminar. Usa el estado Inactivo.' }

## 4. API Routes — src/app/api/comisiones/

### GET /api/comisiones
Query params: operador_id, estado, periodo_inicio, periodo_fin, page, limit
Query:
  supabase.from('comisiones')
    .select(`*, operadores(nombre),
             ordenes_servicio(folio_interno,tipo_servicio,fecha_servicio,clientes(nombre))`)
    .eq(operadorId ? 'operador_id':'', operadorId||'')
    .eq(estado ? 'estado':'', estado||'')
    .gte(inicio ? 'created_at':'', inicio||'')
    .order('created_at', { ascending: false })

### PUT /api/comisiones/liquidar
Body: { operador_id, periodo_inicio, periodo_fin, monto_real?, medio_pago, referencia }
Marcar como pagadas las comisiones pendientes del operador en el período:
  UPDATE comisiones SET estado='pagado', fecha_pago=NOW()
  WHERE operador_id=? AND estado='pendiente' AND created_at BETWEEN ?
REGLA: Solo se puede ejecutar si estado='pendiente'. Nunca modificar estado='pagado'.
Auditoría. invalidateAll().

### GET /api/comisiones/resumen
Retorna resumen por operador para el dashboard:
  SELECT operador_id, operadores.nombre, COUNT(*), SUM(monto_comision)
  FROM comisiones JOIN operadores ON ...
  WHERE estado='pendiente'
  GROUP BY operador_id, operadores.nombre
  ORDER BY SUM DESC

## 5. API Routes — src/app/api/config-comisiones/

### GET /api/config-comisiones
  supabase.from('config_comisiones').select('*').order('tipo_servicio')

### PUT /api/config-comisiones/[id]
Solo actualizar monto_comision.
IMPORTANTE: Agregar nota en la UI: "El cambio aplica solo a nuevos servicios.
Las comisiones ya generadas no se modifican."
Auditoría. invalidateAll().

## 6. Componentes — src/components/modules/operadores/

### OperadoresTable
Columnas: Nombre, RUT, Licencia (clase + vencimiento con alerta si vence pronto),
Contrato, Estado (badge), Comisiones pendientes ($), Acciones.
Badge licencia: ROJO si venció, NARANJA si vence en < 30 días.

### OperadorForm
Campos: nombre*, rut, teléfono, clase licencia, vencimiento licencia,
tipo contrato*, sueldo base, estado.

### OperadorModal: modal estándar crear/editar

### OperadorDetail — src/app/(dashboard)/operadores/[id]/page.tsx
Header: nombre, estado, tipo contrato.

PESTAÑA "Datos":
  Todos los campos. Botón Editar.
  Alerta si licencia vence en < 30 días.

PESTAÑA "Servicios":
  Query: supabase.from('ordenes_servicio')
         .select('folio_interno,tipo_servicio,monto,estado,fecha_servicio,clientes(nombre)')
         .eq('operador_id', id)
         .order('fecha_servicio', { ascending: false })
  Total de servicios y monto generado.

PESTAÑA "Comisiones":
  Selector de período: semana / mes / año (o rango personalizado)
  Query filtrada por operador_id y período.
  Tabla: Fecha, Folio orden, Tipo servicio, Cliente, Monto comisión, Estado.
  Totales: pendiente / pagado del período.
  Botón "Liquidar período": abre modal de liquidación.

PESTAÑA "Historial":
  <ChangeHistoryPanel entityType="operador" entityId={id} />

### LiquidacionModal
Al confirmar liquidación del período:
  1. Mostrar resumen: N servicios · Total $XXX.XXX
  2. Campos: fecha de pago, medio de pago (select), referencia (N° transferencia)
  3. Botón "Confirmar liquidación" → PUT /api/comisiones/liquidar
  4. Al completar: marcar comisiones como pagadas, refrescar UI

## 7. Página configuración comisiones — src/app/(dashboard)/configuracion/comisiones/page.tsx

Tabla editable con los 5 tipos de servicio y su monto de comisión.
Cada fila tiene un input numérico editable inline.
Botón "Guardar cambios" → actualiza los montos via PUT.
Nota informativa: "Los cambios aplican solo a servicios nuevos."

## 8. Página listado — src/app/(dashboard)/operadores/page.tsx

- Resumen arriba: N activos · $XXX.XXX comisiones pendientes totales
- Tabs: Todos | Activos | En vacaciones | Inactivos
- OperadoresTable

## Criterios de aceptación

- [ ] Compila sin errores TypeScript
- [ ] Solo operadores activos aparecen en el selector de órdenes
- [ ] La comisión se genera automáticamente al completar una orden (via trigger)
- [ ] No se puede modificar una comisión en estado 'pagado'
- [ ] La liquidación de período funciona correctamente
- [ ] La alerta de licencia por vencer aparece en la tabla
- [ ] El widget de comisiones del dashboard refleja los totales reales
```
