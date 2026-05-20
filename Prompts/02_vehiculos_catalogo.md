# Módulo 02 — Catálogo de Vehículos
**Sistema de Gestión de Grúas · Claude Code**

---

## Especificaciones

**Tabla Supabase:** `vehiculos_catalogo`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | Generado automáticamente |
| marca | text NOT NULL | Marca del vehículo |
| modelo | text NOT NULL | Modelo del vehículo |
| anio | integer | Año del modelo |
| tipo | enum | `Auto` / `Camioneta` / `Furgón` / `Bus / Minibus` / `Camión` / `Moto` |
| combustible | text | Gasolina / Diésel / Eléctrico / Híbrido / GLP |
| estado | enum | `activo` / `inactivo` |
| created_at | timestamptz | Automático |

**Tabla relacionada:** `clientes_vehiculos`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| cliente_id | uuid FK → clientes | |
| vehiculo_catalogo_id | uuid FK → vehiculos_catalogo | |
| patente | text | Patente del vehículo específico |
| color | text | Color del vehículo |
| observaciones | text | Notas adicionales |

---

## Integración cruzada

**Este módulo RECIBE datos de:**
- Ninguno — es un catálogo maestro de referencia

**Este módulo ENVÍA datos a:**
- `clientes_vehiculos` — cada vehículo de cliente referencia el catálogo
- `ordenes_servicio` — al crear una orden se selecciona el vehículo del cliente, que a su vez referencia el catálogo
- Selector en cascada — Marca → Modelo → Año disponible en cualquier formulario del sistema

**Reglas de negocio:**
- Solo se puede inactivar un ítem del catálogo, nunca eliminar (puede estar referenciado)
- La patente vive en `clientes_vehiculos`, NO en el catálogo
- El catálogo define marca/modelo/año/tipo — la instancia específica (patente, color) vive en el cliente

**Invalidación de React Query al escribir:**
```ts
const { invalidateAll } = useUniversalSync()
await invalidateAll()
// Query keys específicas: ['vehiculos-catalogo']
```

---

## Prompt completo para Claude Code

```
Construye el módulo de Catálogo de Vehículos completo.
El contexto del proyecto está en CLAUDE.md.

## Tablas: vehiculos_catalogo y clientes_vehiculos (ya existen en Supabase)

vehiculos_catalogo: id, marca, modelo, anio, tipo (enum), combustible, estado

clientes_vehiculos: id, cliente_id FK, vehiculo_catalogo_id FK,
                    patente, color, observaciones

## 1. Tipos TypeScript — src/types/index.ts

Agregar:
- VehiculoCatalogo: tipo base completo
- VehiculoCatalogoCreate: sin id ni created_at
- ClienteVehiculo: id, cliente_id, vehiculo_catalogo_id, patente, color, observaciones
- ClienteVehiculoConCatalogo: ClienteVehiculo + vehiculos_catalogo anidado
- VehiculoSelectOption: para el selector cascada { id, marca, modelo, anio, tipo, display }
  donde display = "Toyota Hilux 2021 · Camioneta"

## 2. Schema Zod — src/lib/validations/vehiculos.ts

createVehiculoSchema:
- marca: string min 1 max 100, required ("La marca es obligatoria")
- modelo: string min 1 max 100, required ("El modelo es obligatorio")
- anio: number min 1980 max 2030, optional
- tipo: enum ['Auto','Camioneta','Furgón','Bus / Minibus','Camión','Moto'] required
- combustible: string optional
- estado: enum ['activo','inactivo'] default 'activo'

createClienteVehiculoSchema:
- cliente_id: uuid required
- vehiculo_catalogo_id: uuid required ("Selecciona un vehículo del catálogo")
- patente: string max 8, optional
- color: string optional

## 3. API Routes — src/app/api/vehiculos-catalogo/

### GET /api/vehiculos-catalogo
Query params: q (búsqueda), tipo, estado (default 'activo'), marca
Query:
  supabase.from('vehiculos_catalogo')
    .select('*', { count:'exact' })
    .eq('estado', estado)
    .order('marca').order('modelo').order('anio', { ascending: false })
Retornar paginado.

### GET /api/vehiculos-catalogo/marcas
Retorna lista única de marcas activas (para el selector cascada):
  supabase.from('vehiculos_catalogo')
    .select('marca').eq('estado','activo')
  → deduplicar y ordenar alfabéticamente

### GET /api/vehiculos-catalogo/modelos?marca=Toyota
Retorna modelos de una marca:
  .select('modelo').eq('marca', marca).eq('estado','activo')
  → deduplicar y ordenar

### GET /api/vehiculos-catalogo/anios?marca=Toyota&modelo=Hilux
Retorna años disponibles para marca+modelo:
  .select('id,anio').eq('marca',marca).eq('modelo',modelo).eq('estado','activo')
  .order('anio', { ascending: false })

### POST /api/vehiculos-catalogo
Validar con createVehiculoSchema.
Verificar que no existe la misma combinación marca+modelo+anio.
INSERT. Auditoría. invalidateAll().

### PUT /api/vehiculos-catalogo/[id]
No permitir cambiar marca/modelo/anio si hay clientes_vehiculos que lo referencian.
Solo permitir editar combustible, estado.
Si se intenta cambiar → { error: 'No se puede modificar un vehículo ya asignado a clientes' }

### DELETE /api/vehiculos-catalogo/[id] → soft delete
No eliminar físicamente. SET estado = 'inactivo'.
Verificar que no tenga clientes_vehiculos activos antes.

## 4. API Routes — src/app/api/clientes-vehiculos/

### POST /api/clientes-vehiculos
Validar con createClienteVehiculoSchema.
INSERT en clientes_vehiculos.
Auditoría. invalidateAll().

### DELETE /api/clientes-vehiculos/[id]
Verificar que no tenga ordenes_servicio activas referenciando este vehículo.
Si tiene → error. Si no → DELETE.

## 5. Componente selector en cascada — src/components/shared/VehiculoSelector.tsx

Componente reutilizable usado en:
- Formulario de nueva orden de servicio
- Pestaña Vehículos del cliente

Props:
  interface VehiculoSelectorProps {
    clienteId: string
    value?: string  // cliente_vehiculo_id seleccionado
    onChange: (clienteVehiculoId: string, data: ClienteVehiculoConCatalogo) => void
    allowAddNew?: boolean  // mostrar opción de agregar vehículo nuevo
  }

Comportamiento:
1. Cargar vehículos del cliente:
   supabase.from('clientes_vehiculos')
     .select('*, vehiculos_catalogo(marca,modelo,anio,tipo)')
     .eq('cliente_id', clienteId)
2. Mostrar en select: "Toyota Hilux 2021 · Camioneta · CDKP21"
3. Si allowAddNew = true: opción "+ Agregar vehículo nuevo" al final de la lista
4. Al elegir "Agregar nuevo" → mostrar form inline:
   - Select Marca (desde /api/vehiculos-catalogo/marcas)
   - Select Modelo (carga al elegir marca, desde /api/vehiculos-catalogo/modelos)
   - Select Año (carga al elegir modelo)
   - Input Patente
   - Input Color
   - Botón "Agregar" → POST /api/clientes-vehiculos → selecciona el nuevo vehículo

## 6. Componentes del CRUD del catálogo — src/components/modules/vehiculos/

### VehiculosTable
Columnas: Marca, Modelo, Año, Tipo (badge), Combustible, Estado (badge), Acciones.
Filtros: búsqueda por texto, select de tipo, toggle activos/inactivos.
Acciones: Editar (solo combustible y estado), Inactivar.

### VehiculoForm
Campos: marca*, modelo*, año, tipo*, combustible, estado.
Si está editando y tiene clientes asignados → deshabilitar marca, modelo, año
con tooltip: "No se puede modificar, ya está asignado a clientes".

### VehiculoModal
Modal estándar para crear y editar.

## 7. Página — src/app/(dashboard)/vehiculos-catalogo/page.tsx

- Título "Catálogo de vehículos" con contador
- Botón "Nuevo vehículo"
- VehiculosTable
- Nota informativa: "El catálogo define marca y modelo.
  La patente de cada vehículo se registra en la ficha del cliente."

## Criterios de aceptación

- [ ] Compila sin errores TypeScript
- [ ] El selector en cascada Marca → Modelo → Año funciona correctamente
- [ ] Al agregar un vehículo nuevo desde una orden, queda disponible de inmediato
- [ ] No se puede eliminar un vehículo ya asignado a clientes (solo inactivar)
- [ ] El componente VehiculoSelector es reutilizable desde cualquier módulo
```
