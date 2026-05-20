import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Car,
  Truck,
  HardHat,
  ClipboardList,
  FileText,
  ShoppingCart,
  Receipt,
  Wallet,
  Boxes,
  Settings,
  FileUp,
  Bell,
  LogOut,
  ChevronDown,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Array<"admin" | "contador">;
};

const OPERACIONES: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/vehiculos", label: "Vehículos", icon: Car },
  { to: "/gruas", label: "Grúas", icon: Truck },
  { to: "/operadores", label: "Operadores", icon: HardHat },
  { to: "/ordenes", label: "Órdenes de servicio", icon: ClipboardList },
  { to: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { to: "/ordenes-compra", label: "Órdenes de compra", icon: ShoppingCart },
  { to: "/bodega", label: "Bodega", icon: Boxes },
];

const FINANZAS: NavItem[] = [
  { to: "/cierres", label: "Cierres de período", icon: Receipt },
  { to: "/costos", label: "Costos", icon: Wallet },
];

const SISTEMA: NavItem[] = [
  { to: "/importar", label: "Importadores", icon: FileUp, roles: ["admin", "contador"] },
  { to: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/clientes": "Clientes",
  "/vehiculos": "Vehículos",
  "/gruas": "Grúas",
  "/operadores": "Operadores",
  "/ordenes": "Órdenes de servicio",
  "/cotizaciones": "Cotizaciones",
  "/ordenes-compra": "Órdenes de compra",
  "/bodega": "Bodega",
  "/cierres": "Cierres de período",
  "/costos": "Costos",
  "/importar": "Importadores",
  "/configuracion": "Configuración",
};

function useEmpresa() {
  return useQuery({
    queryKey: ["config_empresa"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("config_empresa")
        .select("nombre, logo_url")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

type Alerta = { id: string; tipo: string; mensaje: string };

function useAlertas() {
  return useQuery<Alerta[]>({
    queryKey: ["alertas"],
    queryFn: async () => {
      const sieteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const treintaDiasAdelante = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const hoy = new Date().toISOString().slice(0, 10);

      const [cierres, operadores, bodega] = await Promise.all([
        supabase
          .from("cierres")
          .select("id, numero, folio_cliente, created_at, cliente_id, clientes!inner(requiere_folio, nombre)")
          .in("estado", ["abierto", "enviado"])
          .lt("created_at", sieteDiasAtras)
          .is("folio_cliente", null),
        supabase
          .from("operadores")
          .select("id, nombre, licencia_vencimiento")
          .not("licencia_vencimiento", "is", null)
          .gte("licencia_vencimiento", hoy)
          .lte("licencia_vencimiento", treintaDiasAdelante),
        supabase.from("bodega_items").select("id, nombre, stock_actual, stock_minimo"),
      ]);

      const alertas: Alerta[] = [];

      (cierres.data ?? [])
        .filter((c: any) => c.clientes?.requiere_folio)
        .forEach((c: any) =>
          alertas.push({
            id: `cierre-${c.id}`,
            tipo: "Cierre sin folio",
            mensaje: `Cierre ${c.numero ?? c.id.slice(0, 8)} de ${c.clientes?.nombre ?? ""} sin folio (>7 días)`,
          }),
        );

      (operadores.data ?? []).forEach((o) =>
        alertas.push({
          id: `op-${o.id}`,
          tipo: "Licencia por vencer",
          mensaje: `${o.nombre} - licencia vence el ${o.licencia_vencimiento}`,
        }),
      );

      (bodega.data ?? [])
        .filter((i) => Number(i.stock_actual ?? 0) <= Number(i.stock_minimo ?? 0))
        .forEach((i) =>
          alertas.push({
            id: `bodega-${i.id}`,
            tipo: "Stock bajo",
            mensaje: `${i.nombre} - stock ${i.stock_actual} / mínimo ${i.stock_minimo}`,
          }),
        );

      return alertas;
    },
    refetchInterval: 60_000,
  });
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = pathname === item.to;
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
        <Link to={item.to} className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {!collapsed && <span>{item.label}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AppSidebarContent() {
  const { user, signOut, isAdmin, isContador } = useAuth();
  const { data: empresa } = useEmpresa();

  const initials = (user?.email ?? "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          {empresa?.logo_url ? (
            <img src={empresa.logo_url} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <div className="h-8 w-8 rounded bg-sidebar-primary flex items-center justify-center">
              <Truck className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
          )}
          <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold truncate">
              {empresa?.nombre ?? "Mi Empresa"}
            </span>
            <span className="text-xs text-sidebar-foreground/60">Gestión de grúas</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {OPERACIONES.map((item) => (
                <NavLink key={item.to} item={item} collapsed={false} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(isAdmin || isContador) && (
          <SidebarGroup>
            <SidebarGroupLabel>Finanzas</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {FINANZAS.map((item) => (
                  <NavLink key={item.to} item={item} collapsed={false} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Sistema</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SISTEMA.map((item) => (
                  <NavLink key={item.to} item={item} collapsed={false} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 overflow-hidden group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-medium truncate">{user?.email}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => signOut()}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function NotificacionesPopover() {
  const { data: alertas = [] } = useAlertas();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {alertas.length > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-xs"
            >
              {alertas.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Alertas pendientes</h3>
          <Separator />
          {alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Sin alertas pendientes.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {alertas.map((a) => (
                <li key={a.id} className="text-sm border-l-2 border-destructive pl-2">
                  <p className="font-medium">{a.tipo}</p>
                  <p className="text-muted-foreground text-xs">{a.mensaje}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "anio">("mes");

  const titulo = useMemo(() => TITLES[pathname] ?? "Sistema", [pathname]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebarContent />
        <div className="flex-1 flex flex-col" style={{ background: "var(--app-bg)" }}>
          <header className="h-14 border-b bg-background flex items-center gap-3 px-4">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">{titulo}</h1>
            <div className="ml-auto flex items-center gap-2">
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as typeof periodo)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semana">Esta semana</SelectItem>
                  <SelectItem value="mes">Este mes</SelectItem>
                  <SelectItem value="anio">Este año</SelectItem>
                </SelectContent>
              </Select>
              <NotificacionesPopover />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
