# Módulo 01 — Clientes
**Sistema de Gestión de Grúas · Claude Code**

---

## Especificaciones

**Tabla Supabase:** `clientes`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | Generado automáticamente |
| rut | text UNIQUE | RUT del cliente |
| nombre | text NOT NULL | Nombre o razón social |
| tipo | enum | `persona_natural` / `empresa` / `aseguradora` |
| email | text | Correo principal |
| telefono | text | Teléfono de contacto |
| direccion | text | Dirección |
| condicion_pago | integer | Días de crédito (0 = contado) |
| requiere_folio | boolean | Si exige folio/OC para facturar |
| periodo_cierre | enum | `mensual` / `quincenal` / `semanal` |
| emails_cierre | text[] | Emails para envío de cierres |
| iva_incluido | boolean | IVA en servicios por defecto |
| observaciones | text | Notas internas |
| created_at / updated_at | timestamptz | Automáticos |

---

## Integración cruzada

**Este módulo RECIBE datos de:**
- `vehiculos_catalogo` — para registrar vehículos del cliente (marca, modelo, año)
- `ordenes_servicio` — historial de servicios del cliente
- `cierres` — saldo pendiente de cobro por cliente
- `cotizaciones` — historial de cotizaciones emitidas

**Este módulo ENVÍA datos a:**
- `ordenes_servicio` — `cliente_id` referenciado en cada orden
- `cierres` — `cliente_id` + `requiere_folio` + `periodo_cierre` condicionan el flujo de cierre
- `cotizaciones` — `cliente_id` referenciado
- `ordenes_compra` — `cliente_id` referenciado

**Reglas de negocio críticas:**
- `requiere_folio = true` bloquea el avance de cierres a estado `facturado` sin folio registrado
- `periodo_cierre` define cada cuánto se generan los cierres automáticos del cliente
- `iva_incluido` se hereda como valor por defecto al crear cotizaciones y cierres

**Invalidación de React Query al escribir:**
```ts
const { invalidateAll } = useUniversalSync()
await invalidateAll()
// Query keys específicas: ['clientes'], ['dashboard']
```

---

## Prompt completo para Claude Code

```
Construye el módulo de Clientes completo.
El contexto del proyecto está en CLAUDE.md.

## Tabla: clientes (ya existe en Supabase)
Campos: id, rut (unique), nombre, tipo (enum: persona_natural/empresa/aseguradora),
email, telefono, direccion, condicion_pago (integer días), requiere_folio (boolean),
periodo_cierre (enum: mensual/quincenal/semanal), emails_cierre (text[]),
iva_incluido (boolean), observaciones, created_at, updated_at

## 1. Tipos TypeScript — src/types/index.ts

Agregar:
- Cliente: tipo base con todos los campos
- ClienteCreate: sin id ni timestamps
- ClienteEdit: todo opcional excepto id
- ClienteConVehiculos: Cliente + clientes_vehiculos[] con vehiculos_catalogo anidado
- ClienteListItem: id, nombre, rut, tipo, telefono, condicion_pago, requiere_folio

## 2. Schema Zod — src/lib/validations/clientes.ts

createClienteSchema:
- nombre: string min 2 max 200, required ("El nombre es obligatorio")
- rut: string, validar formato chileno XX.XXX.XXX-X, optional
- tipo: enum ['persona_natural','empresa','aseguradora'] required
- email: email válido, optional
- telefono: string, optional
- condicion_pago: number min 0 max 180, default 0
- requiere_folio: boolean default false
- periodo_cierre: enum ['mensual','quincenal','semanal'] default 'mensual'
- iva_incluido: boolean default true

editClienteSchema: mismo con .partial() excepto id

## 3. API Routes — src/app/api/clientes/

### GET /api/clientes
Query params: q (búsqueda por nombre o RUT), tipo, page (default 1), limit (default 20)
Query Supabase:
  supabase.from('clientes')
    .select('id,nombre,rut,tipo,telefono,condicion_pago,requiere_folio', { count:'exact' })
    .ilike(q ? 'nombre' : '', q ? '%'+q+'%' : '')
    .eq(tipo ? 'tipo' : '', tipo || '')
    .order('nombre')
    .range(offset, offset+limit-1)
Retornar: { data: ClienteListItem[], total: number, page, limit }

### POST /api/clientes
Validar con createClienteSchema.
Si rut duplicado → retornar { error: 'Ya existe un cliente con ese RUT', field: 'rut' }
INSERT en clientes.
INSERT en service_change_history { entity_type:'cliente', action:'created' }
Llamar invalidateAll().

### GET /api/clientes/[id]
Query con joins:
  supabase.from('clientes')
    .select(`*, clientes_vehiculos(*, vehiculos_catalogo(*))`)
    .eq('id', id).single()

### PUT /api/clientes/[id]
Validar con editClienteSchema.
UPDATE clientes.
INSERT service_change_history { action:'updated', old_value, new_value }.
Llamar invalidateAll().

### DELETE /api/clientes/[id]
Verificar que no tenga ordenes_servicio activas (estado != 'anulado').
Si tiene → retornar { error: 'No se puede eliminar un cliente con servicios activos' }
Si no tiene → DELETE. Llamar invalidateAll().

## 4. Componentes — src/components/modules/clientes/

### ClientesTable
TanStack Table con columnas: Nombre, RUT, Tipo (badge de color), Teléfono,
Condición pago (N días), Requiere folio (ícono check/x), Acciones.
Filtros: input de búsqueda (nombre o RUT), select de tipo.
Paginación de 20 registros.
Al hacer clic en la fila → navegar a /clientes/[id]

### ClienteForm
react-hook-form + createClienteSchema/editClienteSchema.
Campos agrupados en dos columnas:
  Col 1: nombre*, tipo*, rut, email, teléfono, dirección
  Col 2: condición pago, requiere folio (toggle), período cierre,
         IVA incluido (toggle), emails cierre (input múltiple), observaciones
Mostrar errores de validación en español bajo cada campo.

### ClienteModal
Modal que contiene ClienteForm para crear y editar.
Título dinámico: "Nuevo cliente" o "Editar cliente — [nombre]".
Al guardar: llamar API, cerrar modal, refrescar tabla SIN recargar página.

### ClienteDetail — src/app/(dashboard)/clientes/[id]/page.tsx
Ficha completa con pestañas:

PESTAÑA "Datos":
  Todos los campos del cliente en formato de lectura.
  Botón "Editar" abre ClienteModal.

PESTAÑA "Vehículos":
  Lista de vehículos registrados del cliente.
  Query: supabase.from('clientes_vehiculos')
         .select('*, vehiculos_catalogo(marca,modelo,anio,tipo)')
         .eq('cliente_id', id)
  Mostrar: "Toyota Hilux 2021 · Camioneta · CDKP21 · Blanco"
  Botón "Agregar vehículo":
    - Select cascada: Marca → Modelo → Año (desde vehiculos_catalogo)
    - Campos adicionales: patente, color, observaciones
    - INSERT en clientes_vehiculos

PESTAÑA "Servicios":
  Historial de órdenes de servicio del cliente.
  Query: supabase.from('ordenes_servicio')
         .select('folio_interno,folio_cliente,tipo_servicio,monto,estado,fecha_servicio')
         .eq('cliente_id', id)
         .order('fecha_servicio', { ascending: false })
         .limit(50)
  Tabla con: Folio, Fecha, Tipo, Monto, Estado (badge).
  Clic en fila → navegar a /ordenes/[id]

PESTAÑA "Saldo":
  Cierres pendientes de cobro.
  Query: supabase.from('cierres')
         .select('numero,periodo_inicio,periodo_fin,total,estado,folio_cliente')
         .eq('cliente_id', id)
         .in('estado', ['enviado','con_folio'])
  Mostrar suma total pendiente en rojo destacado.
  Badge de estado por cierre.

PESTAÑA "Historial":
  <ChangeHistoryPanel entityType="cliente" entityId={id} />

## 5. Página listado — src/app/(dashboard)/clientes/page.tsx

- Título "Clientes" con contador de total
- Botón "Nuevo cliente" (abre ClienteModal)
- ClientesTable con filtros
- Estado de carga: skeleton de 5 filas
- Estado vacío: "No hay clientes registrados. Crea el primero."

## Criterios de aceptación

- [ ] Compila sin errores TypeScript
- [ ] Búsqueda por nombre y RUT funciona en tiempo real
- [ ] Al crear un cliente, aparece en la tabla sin recargar la página
- [ ] Los vehículos del cliente se agregan desde la pestaña Vehículos
- [ ] El saldo muestra correctamente los cierres pendientes
- [ ] El historial registra creación y edición del cliente
- [ ] No se puede eliminar un cliente con servicios activos
```
