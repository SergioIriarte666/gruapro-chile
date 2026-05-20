# Módulo 11 — Dashboard Principal
**Sistema de Gestión de Grúas · Claude Code**

---

## Integración cruzada

Consume datos de TODOS los módulos vía React Query.
Usa `useUnifiedRealtimeManager` para actualización automática.
Se actualiza en tiempo real con Supabase Realtime.

---

## Prompt completo para Claude Code

```
Construye el dashboard principal del sistema.
El contexto del proyecto está en CLAUDE.md.

## Página: src/app/(dashboard)/page.tsx

El dashboard muestra el estado del negocio en tiempo real.
Selector de período: Semana | Mes | Año (tabs arriba a la derecha).
Al cambiar período → recalcular todas las queries sin recargar.

## 1. Montar el Realtime Manager en el layout

En src/app/(dashboard)/layout.tsx:
  import { useUnifiedRealtimeManager } from '@/hooks/useUnifiedRealtimeManager'
  export default function DashboardLayout({ children }) {
    useUnifiedRealtimeManager()
    return <>{children}</>
  }

## 2. KPIs principales — 4 cards en fila superior

### KPI 1 — Ingresos del período
  supabase.from('ordenes_servicio')
    .select('monto').in('estado',['completado','facturado'])
    .gte('fecha_servicio', inicio).lte('fecha_servicio', fin)
  Sumar en cliente. Mostrar delta vs período anterior (%).

### KPI 2 — Número de servicios
  supabase.from('ordenes_servicio')
    .select('id', { count:'exact' })
    .in('estado',['completado','facturado'])
    .gte('fecha_servicio', inicio).lte('fecha_servicio', fin)
  Delta vs período anterior.

### KPI 3 — Por cobrar
  supabase.from('cierres').select('total')
    .in('estado',['enviado','con_folio'])
  Suma total de cierres pendientes de cobro.

### KPI 4 — Margen neto
  Ingresos del período − costos del período.
  supabase.from('costos').select('monto')
    .gte('fecha', inicio).lte('fecha', fin)
  Mostrar como % sobre ingresos.

## 3. Widget Alertas — ordenadas por urgencia

Construir con múltiples queries paralelas (Promise.all):

Query 1 — Cierres sin folio > 7 días (CRÍTICO):
  supabase.from('cierres')
    .select('numero,clientes(nombre),updated_at')
    .eq('estado','enviado')
    .lt('updated_at', new Date(Date.now()-7*24*60*60*1000).toISOString())

Query 2 — Cotizaciones por vencer (URGENTE):
  supabase.from('cotizaciones')
    .select('numero,clientes(nombre),fecha_vencimiento')
    .eq('estado','enviada')
    .lte('fecha_vencimiento', new Date(Date.now()+2*24*60*60*1000).toISOString())
    .gte('fecha_vencimiento', new Date().toISOString())

Query 3 — Bodega bajo stock mínimo (ADVERTENCIA):
  supabase.from('bodega_items')
    .select('nombre,stock_actual,stock_minimo')
    .filter('stock_actual','lt','stock_minimo')

Query 4 — Servicios sin operador (PENDIENTE):
  supabase.from('ordenes_servicio')
    .select('folio_interno,clientes(nombre)')
    .eq('estado','pendiente').is('operador_id',null)

Query 5 — Licencias por vencer (ADVERTENCIA):
  supabase.from('operadores')
    .select('nombre,licencia_clase,licencia_vencimiento')
    .eq('estado','activo')
    .lte('licencia_vencimiento',
      new Date(Date.now()+30*24*60*60*1000).toISOString().split('T')[0])

Mostrar máximo 8 alertas, ordenadas por severity.
Badge rojo con total de alertas en el header.

## 4. Widget Servicios recientes

  supabase.from('ordenes_servicio')
    .select('folio_interno,folio_cliente,tipo_servicio,monto,estado,
             fecha_servicio,clientes(nombre),
             clientes_vehiculos(patente,vehiculos_catalogo(marca,modelo))')
    .order('created_at', { ascending: false }).limit(8)

Tabla compacta con badge de estado por fila.
Clic en fila → navegar a /ordenes/[id].

## 5. Widget Cierres activos

  supabase.from('cierres')
    .select('numero,periodo_inicio,periodo_fin,total,estado,
             folio_cliente,clientes(nombre)')
    .not('estado','in','("pagado","anulado")')
    .order('created_at', { ascending: false })

Lista con: cliente, período, monto, badge de estado.
Clic → navegar a /cierres/[id].

## 6. Widget Estado de flota

  supabase.from('gruas').select('estado')
Contar por estado. Mostrar 3 anillos SVG concéntricos:
  Verde (activas) / Naranja (en mantención) / Gris (baja).
Texto central: "N / Total".
Click en anillo → filtra el listado de grúas.

## 7. Widget Ingresos por tipo de servicio

  supabase.from('ordenes_servicio')
    .select('tipo_servicio,monto')
    .in('estado',['completado','facturado'])
    .gte('fecha_servicio', inicio).lte('fecha_servicio', fin)
Agrupar por tipo_servicio, sumar montos.
Recharts BarChart horizontal.
Labels en español para cada tipo.

## 8. Widget Comisiones operadores

  supabase.from('comisiones')
    .select('monto_comision,operadores(nombre)')
    .eq('estado','pendiente')
Agrupar por operador, sumar.
Lista: nombre · N servicios · $XXX pendiente.
Botón "Liquidar" → navegar a /operadores/[id].

## 9. Widget Costos del mes

  supabase.from('costos')
    .select('monto,categorias_costo(nombre)')
    .gte('fecha', inicio_mes).lte('fecha', fin_mes)
Agrupar por categoría, sumar.
Recharts BarChart horizontal con 6 categorías principales.
Link "Ver desglose completo" → navegar a /costos.

## 10. Supabase Realtime (ya configurado en layout)

El useUnifiedRealtimeManager montado en el layout llama
invalidateAll() ante cualquier cambio. Los widgets se actualizan
automáticamente via React Query.

Agregar refetch automático cada 5 minutos como fallback:
  useQuery({ queryKey:['dashboard-kpis'], refetchInterval: 5*60*1000, ... })

## Criterios de aceptación
- [ ] Los KPIs cambian al cambiar el período (semana/mes/año)
- [ ] Las alertas muestran información real desde Supabase
- [ ] Al crear una orden en otra pestaña, el dashboard se actualiza solo
- [ ] Los widgets de flota y comisiones reflejan datos reales
- [ ] El tiempo de carga inicial es < 2 segundos (queries en paralelo)
```
