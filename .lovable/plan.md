# Plan: Layout principal + Auth + Roles

## 1. Configuración backend

- Habilitar auto-confirm email en Supabase Auth.
- Trigger SQL `handle_new_user`: al insertarse el primer usuario en `auth.users`, si `user_roles` está vacía, asignarle rol `admin` automáticamente. Para usuarios posteriores no asigna rol (los crea el admin desde Configuración más adelante).
- Seed: insertar fila inicial en `config_empresa` (nombre placeholder "Mi Empresa de Grúas") para que `genera_folio()` funcione y el sidebar tenga datos que mostrar.

## 2. Auth context y hook

- `src/hooks/use-auth.tsx`: provider con `session`, `user`, `roles[]`, `loading`, `signIn`, `signOut`.
  - `supabase.auth.onAuthStateChange` configurado **antes** de `getSession()`.
  - Tras obtener sesión, carga roles desde `public.user_roles` con `.select('role').eq('user_id', user.id)`.
  - Expone helpers `hasRole(role)`, `isAdmin`, `isOperador`, `isContador`.
- Montar el provider en `src/routes/__root.tsx` envolviendo `<Outlet />`.
- Listener invalida `router` y `queryClient` en cada cambio de auth.

## 3. Rutas

```
src/routes/
  __root.tsx              (providers, sin chrome)
  login.tsx               (form email/password, redirige si ya hay sesión)
  _app.tsx                (layout protegido: si no hay sesión → /login;
                           si rol operador → renderiza OperadorLayout;
                           si admin/contador → renderiza AdminLayout)
  _app/index.tsx          (dashboard)
  _app/clientes.tsx
  _app/vehiculos.tsx
  _app/gruas.tsx
  _app/operadores.tsx
  _app/ordenes.tsx
  _app/cotizaciones.tsx
  _app/ordenes-compra.tsx
  _app/cierres.tsx
  _app/costos.tsx
  _app/bodega.tsx
  _app/configuracion.tsx
```

Cada ruta interna es por ahora un placeholder con título + "En construcción" para validar navegación; el contenido real vendrá en prompts siguientes.

Se elimina `src/routes/index.tsx` placeholder (o se redirige a `/login` / `/`).

## 4. AdminLayout (admin + contador)

Componente `src/components/layout/AdminLayout.tsx` usando shadcn `Sidebar`:

- **Sidebar** (`bg: #1a1a2e`, texto blanco, `collapsible="icon"`):
  - Header: logo (si `config_empresa.logo_url`) + `nombre`.
  - Grupo "Operaciones": Dashboard, Clientes, Vehículos, Grúas, Operadores, Órdenes, Cotizaciones, Órdenes de compra, Bodega.
  - Grupo "Finanzas": Cierres, Costos (visible solo si admin o contador — ambos los ven).
  - Grupo "Sistema": Configuración (solo admin).
  - Footer: avatar + nombre/email del usuario + botón "Cerrar sesión".
- **Topbar**:
  - `SidebarTrigger` (hamburger en móvil).
  - Título dinámico (derivado de la ruta activa via `useRouterState`).
  - Selector de período activo (semana / mes / año) — estado en React, se usará luego en dashboard/reportes.
  - Campana de notificaciones con badge: hook `useAlertas()` que consulta vía TanStack Query:
    - Cierres `estado in ('abierto','enviado')` con `created_at < now() - 7d` y cliente `requiere_folio = true` y `folio_cliente IS NULL`.
    - Licencias de operadores con `licencia_vencimiento` en los próximos 30 días.
    - `bodega_items` con `stock_actual <= stock_minimo`.
    - Popover muestra lista resumida.
- **Main**: `bg: #f8f9fa`, padding, `<Outlet />`.
- Responsive: sidebar `offcanvas` en móvil.

## 5. OperadorLayout

Componente `src/components/layout/OperadorLayout.tsx`:

- Topbar simple: nombre empresa + avatar + cerrar sesión.
- Una sola vista (no sidebar) con dos tarjetas:
  - "Mis órdenes de hoy": query `ordenes_servicio` filtrando por `operador_id = (mi operador)` y `fecha_servicio::date = today`. Cada item con botón para actualizar estado (pendiente → en_curso → completado).
  - "Mis comisiones del mes": query `comisiones` filtrando por `operador_id` y `created_at` en el mes actual, mostrando total pendiente vs pagado.
- Para esto necesitamos vincular `auth.users.id` con `operadores.id`. Propuesta: agregar columna `user_id uuid` (nullable, unique) a `operadores`. El admin la asignará desde la pantalla de operadores (prompt futuro). Mientras esté null, la vista muestra mensaje "Tu cuenta aún no está vinculada a un operador, contacta al administrador".

## 6. Login page

- Form shadcn (email, password) + botón "Iniciar sesión".
- Mensaje informativo: "El primer usuario registrado será el administrador". Link "Crear cuenta" que abre `supabase.auth.signUp` (sin opción de elegir rol).
- Tras `signInWithPassword` exitoso → `navigate({ to: '/' })`.
- Si ya hay sesión al entrar → redirect a `/`.
- Manejo de errores con `toast` (sonner).

## 7. Diseño / tokens

- Añadir tokens en `src/styles.css`:
  - `--sidebar-bg: #1a1a2e`
  - `--app-bg: #f8f9fa`
  - Mapear a variables de shadcn-sidebar (`--sidebar-background`, `--sidebar-foreground`, etc.) en `:root` y `.dark`.
- Toda la UI en español (Chile). Fechas formateadas con `date-fns/locale/es` (`dd/MM/yyyy`). Helper `formatCLP(n)` para moneda.

## 8. Migración SQL necesaria

```sql
-- Trigger primer admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Vinculación operador ↔ usuario
alter table public.operadores add column user_id uuid unique references auth.users(id) on delete set null;
create index on public.operadores(user_id);

-- Seed config_empresa (solo si vacío)
insert into public.config_empresa (nombre)
select 'Mi Empresa de Grúas'
where not exists (select 1 from public.config_empresa);
```

## 9. Entregables esta iteración

- Migración aplicada (trigger, columna `user_id`, seed).
- Auth configurada (auto-confirm).
- `useAuth` provider + integración en `__root.tsx`.
- `/login` funcional.
- `_app` layout protegido que enruta por rol.
- `AdminLayout` con sidebar + topbar + notificaciones (consulta real).
- `OperadorLayout` con sus dos tarjetas.
- Todas las rutas internas creadas como placeholders navegables.
- Tokens visuales aplicados.

Las pantallas internas (CRUD de clientes, órdenes, etc.) quedan como placeholders y se construyen en los siguientes prompts.
