import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardList,
  Clock,
  CreditCard,
  FileText,
  Package,
  ShieldAlert,
  TrendingUp,
  Truck,
  UserX,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatCLP, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

type Periodo = "semana" | "mes" | "anio";

function rangoPeriodo(p: Periodo) {
  const fin = new Date();
  const inicio = new Date();
  if (p === "semana") inicio.setDate(inicio.getDate() - 7);
  if (p === "mes") inicio.setMonth(inicio.getMonth() - 1);
  if (p === "anio") inicio.setFullYear(inicio.getFullYear() - 1);
  const diffMs = fin.getTime() - inicio.getTime();
  const finPrev = new Date(inicio.getTime());
  const inicioPrev = new Date(inicio.getTime() - diffMs);
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
    inicioISO: inicio.toISOString(),
    finISO: fin.toISOString(),
    prevInicio: inicioPrev.toISOString().slice(0, 10),
    prevFin: finPrev.toISOString().slice(0, 10),
    prevInicioISO: inicioPrev.toISOString(),
    prevFinISO: finPrev.toISOString(),
  };
}

function pctDelta(actual: number, prev: number) {
  if (!prev) return null;
  return ((actual - prev) / prev) * 100;
}

function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const r = useMemo(() => rangoPeriodo(periodo), [periodo]);
  const queryClient = useQueryClient();

  const { data: ingresos = 0 } = useQuery({
    queryKey: ["kpi-ingresos", r.inicio, r.fin],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("monto")
        .in("estado", ["completado", "facturado"])
        .gte("fecha_servicio", r.inicioISO)
        .lte("fecha_servicio", r.finISO);
      if (error) throw error;
      return (data ?? []).reduce((s, x: any) => s + Number(x.monto ?? 0), 0);
    },
  });

  const { data: ingresosPrev = 0 } = useQuery({
    queryKey: ["kpi-ingresos-prev", r.prevInicio, r.prevFin],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("monto")
        .in("estado", ["completado", "facturado"])
        .gte("fecha_servicio", r.prevInicioISO)
        .lte("fecha_servicio", r.prevFinISO);
      if (error) throw error;
      return (data ?? []).reduce((s, x: any) => s + Number(x.monto ?? 0), 0);
    },
  });

  const { data: numServicios = 0 } = useQuery({
    queryKey: ["kpi-num-servicios", r.inicio, r.fin],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("ordenes_servicio")
        .select("id", { count: "exact", head: true })
        .in("estado", ["completado", "facturado"])
        .gte("fecha_servicio", r.inicioISO)
        .lte("fecha_servicio", r.finISO);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: numServiciosPrev = 0 } = useQuery({
    queryKey: ["kpi-num-servicios-prev", r.prevInicio, r.prevFin],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("ordenes_servicio")
        .select("id", { count: "exact", head: true })
        .in("estado", ["completado", "facturado"])
        .gte("fecha_servicio", r.prevInicioISO)
        .lte("fecha_servicio", r.prevFinISO);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: porCobrar = 0 } = useQuery({
    queryKey: ["kpi-por-cobrar"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("total")
        .in("estado", ["enviado", "con_folio"]);
      if (error) throw error;
      return (data ?? []).reduce((s, x: any) => s + Number(x.total ?? 0), 0);
    },
  });

  const { data: costos = 0 } = useQuery({
    queryKey: ["kpi-costos", r.inicio, r.fin],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("costos")
        .select("monto")
        .gte("fecha", r.inicio)
        .lte("fecha", r.fin);
      if (error) throw error;
      return (data ?? []).reduce((s, x: any) => s + Number(x.monto ?? 0), 0);
    },
  });

  const margen = ingresos - costos;
  const ingresosDelta = pctDelta(ingresos, ingresosPrev);
  const serviciosDelta = pctDelta(numServicios, numServiciosPrev);
  const margenPct = ingresos ? (margen / ingresos) * 100 : null;

  type DashboardAlerta = {
    key: string;
    severity: "critico" | "urgente" | "advertencia" | "pendiente";
    title: string;
    subtitle?: string;
    to: string;
    icon: React.ReactNode;
  };

  const { data: alertasData = { total: 0, items: [] as DashboardAlerta[] } } = useQuery({
    queryKey: ["dashboard-alertas"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const hoy = new Date();
      const hoyStr = hoy.toISOString().slice(0, 10);
      const in2 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 2).toISOString().slice(0, 10);
      const in30 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 30).toISOString().slice(0, 10);

      const [cierresAtrasados, cotizacionesVencen, bajoStock, sinOperadorRows, licenciasVencen] =
        await Promise.all([
          supabase
            .from("cierres")
            .select("id,numero,updated_at,clientes(nombre)")
            .eq("estado", "enviado")
            .lt("updated_at", seteDiasAtras),
          supabase
            .from("cotizaciones")
            .select("id,numero,fecha_vencimiento,clientes(nombre)")
            .eq("estado", "enviada")
            .gte("fecha_vencimiento", hoyStr)
            .lte("fecha_vencimiento", in2)
            .order("fecha_vencimiento", { ascending: true }),
          supabase
            .from("bodega_items")
            .select("id,nombre,stock_actual,stock_minimo")
            .order("nombre"),
          supabase
            .from("ordenes_servicio")
            .select("id,folio_interno,clientes(nombre)")
            .eq("estado", "pendiente")
            .is("operador_id", null),
          supabase
            .from("operadores")
            .select("id,nombre,licencia_clase,licencia_vencimiento")
            .eq("estado", "activo")
            .lte("licencia_vencimiento", in30)
            .order("licencia_vencimiento", { ascending: true }),
        ]);

      const errors = [
        cierresAtrasados.error,
        cotizacionesVencen.error,
        bajoStock.error,
        sinOperadorRows.error,
        licenciasVencen.error,
      ].filter(Boolean);
      if (errors.length) throw errors[0];

      const items: DashboardAlerta[] = [];

      for (const c of cierresAtrasados.data ?? []) {
        items.push({
          key: `cierre-${(c as any).id}`,
          severity: "critico",
          icon: <ShieldAlert className="h-4 w-4" />,
          title: `Cierre ${(c as any).numero ?? (c as any).id.slice(0, 8)} sin folio hace +7 días`,
          subtitle: (c as any).clientes?.nombre ?? "Cliente",
          to: `/cierres/${(c as any).id}`,
        });
      }

      for (const c of cotizacionesVencen.data ?? []) {
        items.push({
          key: `cot-${(c as any).id}`,
          severity: "urgente",
          icon: <Clock className="h-4 w-4" />,
          title: `Cotización ${(c as any).numero ?? (c as any).id.slice(0, 8)} por vencer`,
          subtitle: `${(c as any).clientes?.nombre ?? "Cliente"} · Vence ${formatDate((c as any).fecha_vencimiento)}`,
          to: `/cotizaciones/${(c as any).id}`,
        });
      }

      for (const i of (bajoStock.data ?? []).filter(
        (row: any) => Number(row.stock_actual ?? 0) < Number(row.stock_minimo ?? 0),
      )) {
        items.push({
          key: `stock-${(i as any).id}`,
          severity: "advertencia",
          icon: <Package className="h-4 w-4" />,
          title: `Stock bajo: ${(i as any).nombre}`,
          subtitle: `${(i as any).stock_actual} / mínimo ${(i as any).stock_minimo}`,
          to: "/bodega",
        });
      }

      for (const o of sinOperadorRows.data ?? []) {
        items.push({
          key: `sin-op-${(o as any).id}`,
          severity: "pendiente",
          icon: <UserX className="h-4 w-4" />,
          title: `Orden ${(o as any).folio_interno ?? (o as any).id.slice(0, 8)} sin operador`,
          subtitle: (o as any).clientes?.nombre ?? undefined,
          to: `/ordenes/${(o as any).id}`,
        });
      }

      for (const op of licenciasVencen.data ?? []) {
        items.push({
          key: `lic-${(op as any).id}`,
          severity: "advertencia",
          icon: <FileText className="h-4 w-4" />,
          title: `Licencia por vencer: ${(op as any).nombre}`,
          subtitle: `${(op as any).licencia_clase ?? "Sin clase"} · ${(op as any).licencia_vencimiento ?? "—"}`,
          to: `/operadores/${(op as any).id}`,
        });
      }

      const weight: Record<DashboardAlerta["severity"], number> = {
        critico: 0,
        urgente: 1,
        advertencia: 2,
        pendiente: 3,
      };

      const sorted = items.sort((a, b) => weight[a.severity] - weight[b.severity]);
      return { total: items.length, items: sorted.slice(0, 8) };
    },
  });

  const { data: porTipo = [] } = useQuery({
    queryKey: ["chart-por-tipo", r.inicio, r.fin],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("tipo_servicio,monto")
        .in("estado", ["completado", "facturado"])
        .gte("fecha_servicio", r.inicioISO)
        .lte("fecha_servicio", r.finISO);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const k = (row as any).tipo_servicio ?? "Sin tipo";
        map[k] = (map[k] ?? 0) + Number((row as any).monto ?? 0);
      }
      return Object.entries(map)
        .map(([tipo, monto]) => ({ tipo, monto }))
        .sort((a, b) => b.monto - a.monto);
    },
  });

  const { data: flota = { activa: 0, en_mantencion: 0, baja: 0, total: 0 } } = useQuery({
    queryKey: ["flota-estados"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("gruas").select("estado");
      if (error) throw error;
      const counts = { activa: 0, en_mantencion: 0, baja: 0, total: 0 };
      for (const g of data ?? []) {
        const e = (g as any).estado ?? "activa";
        if (e in counts) (counts as any)[e]++;
        counts.total++;
      }
      return counts;
    },
  });

  const { data: recientes = [] } = useQuery({
    queryKey: ["dashboard-recientes"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select(
          "id,folio_interno,folio_cliente,tipo_servicio,monto,estado,fecha_servicio,created_at, clientes(nombre), clientes_vehiculos(patente,vehiculos_catalogo(marca,modelo))",
        )
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: cierresActivos = [] } = useQuery({
    queryKey: ["dashboard-cierres-activos"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("id,numero,periodo_inicio,periodo_fin,total,estado,folio_cliente,clientes(nombre)")
        .not("estado", "in", '("pagado","anulado")')
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: comisionesPendientes = [] } = useQuery({
    queryKey: ["dashboard-comisiones-pendientes"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comisiones")
        .select("monto_comision,operador_id,operadores(nombre)")
        .eq("estado", "pendiente");
      if (error) throw error;
      const map: Record<string, { operadorId: string; nombre: string; servicios: number; monto: number }> = {};
      for (const row of data ?? []) {
        const operadorId = (row as any).operador_id as string;
        if (!operadorId) continue;
        const nombre = (row as any).operadores?.nombre ?? "Operador";
        map[operadorId] = map[operadorId] ?? { operadorId, nombre, servicios: 0, monto: 0 };
        map[operadorId].servicios += 1;
        map[operadorId].monto += Number((row as any).monto_comision ?? 0);
      }
      return Object.values(map).sort((a, b) => b.monto - a.monto).slice(0, 8);
    },
  });

  const { data: costosMes = [] } = useQuery({
    queryKey: ["dashboard-costos-mes"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      const now = new Date();
      const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("costos")
        .select("monto,categorias_costo(nombre)")
        .gte("fecha", inicioMes)
        .lte("fecha", finMes);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const k = (row as any).categorias_costo?.nombre ?? "Sin categoría";
        map[k] = (map[k] ?? 0) + Number((row as any).monto ?? 0);
      }
      return Object.entries(map)
        .map(([categoria, monto]) => ({ categoria, monto }))
        .sort((a, b) => b.monto - a.monto)
        .slice(0, 6);
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordenes_servicio" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kpi-ingresos"] });
          queryClient.invalidateQueries({ queryKey: ["kpi-ingresos-prev"] });
          queryClient.invalidateQueries({ queryKey: ["kpi-num-servicios"] });
          queryClient.invalidateQueries({ queryKey: ["kpi-num-servicios-prev"] });
          queryClient.invalidateQueries({ queryKey: ["chart-por-tipo"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-alertas"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-recientes"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cierres" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kpi-por-cobrar"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-alertas"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-cierres-activos"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "costos" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kpi-costos"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard-costos-mes"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cotizaciones" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-alertas"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bodega_items" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-alertas"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bodega_movimientos" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-alertas"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "operadores" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-alertas"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comisiones" },
        () => queryClient.invalidateQueries({ queryKey: ["dashboard-comisiones-pendientes"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Indicadores en tiempo real · {formatDate(r.inicio)} → {formatDate(r.fin)}
          </p>
        </div>
        <Tabs value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
          <TabsList>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mes</TabsTrigger>
            <TabsTrigger value="anio">Año</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Ingresos"
          value={formatCLP(ingresos)}
          delta={ingresosDelta}
          icon={<CircleDollarSign className="h-4 w-4" />}
          accent="text-green-600"
        />
        <KpiCard
          title="N° servicios"
          value={String(numServicios)}
          delta={serviciosDelta}
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <KpiCard
          title="Por cobrar"
          value={formatCLP(porCobrar)}
          icon={<Clock className="h-4 w-4" />}
          accent="text-amber-600"
        />
        <KpiCard
          title="Margen neto"
          value={`${formatCLP(margen)}${margenPct == null ? "" : ` · ${margenPct.toFixed(1)}%`}`}
          icon={<TrendingUp className="h-4 w-4" />}
          accent={margen >= 0 ? "text-green-600" : "text-destructive"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico ingresos por tipo */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ingresos por tipo de servicio</CardTitle>
          </CardHeader>
          <CardContent style={{ height: 320 }}>
            {porTipo.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin datos en el período.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porTipo} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCLP(v)} />
                  <YAxis type="category" dataKey="tipo" width={110} className="capitalize" />
                  <Tooltip formatter={(v: number) => formatCLP(v)} />
                  <Bar dataKey="monto" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Flota */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="h-4 w-4" /> Estado de la flota
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FlotaRing
              activa={flota.activa}
              mantencion={flota.en_mantencion}
              baja={flota.baja}
              total={flota.total}
            />
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Alertas operativas
            {alertasData.total > 0 && (
              <Badge variant="destructive" className="ml-2">
                {alertasData.total}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alertasData.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todo en orden</p>
          ) : (
            alertasData.items.map((a) => (
              <AlertRow
                key={a.key}
                icon={a.icon}
                title={a.title}
                subtitle={a.subtitle}
                severity={a.severity}
                to={a.to}
              />
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Servicios recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin servicios recientes.</p>
            ) : (
              <div className="space-y-2">
                {recientes.map((s: any) => (
                  <a
                    key={s.id}
                    href={`/ordenes/${s.id}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-accent transition"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.folio_interno ?? s.id.slice(0, 8)} · {s.clientes?.nombre ?? "Cliente"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {formatDate(s.fecha_servicio)} · {(s.tipo_servicio ?? "—").replace("_", " ")} ·{" "}
                        {s.clientes_vehiculos?.patente
                          ? `${s.clientes_vehiculos.patente} ${s.clientes_vehiculos.vehiculos_catalogo?.marca ?? ""} ${s.clientes_vehiculos.vehiculos_catalogo?.modelo ?? ""}`.trim()
                          : "Sin vehículo"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="capitalize">
                        {s.estado ?? "—"}
                      </Badge>
                      <div className="font-semibold">{formatCLP(s.monto ?? 0)}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cierres activos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cierresActivos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cierres activos.</p>
            ) : (
              cierresActivos.map((c: any) => (
                <a
                  key={c.id}
                  href={`/cierres/${c.id}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-accent transition"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.numero ?? c.id.slice(0, 8)} · {c.clientes?.nombre ?? "Cliente"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {formatDate(c.periodo_inicio)} → {formatDate(c.periodo_fin)}
                      {c.folio_cliente ? ` · ${c.folio_cliente}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="capitalize">
                      {(c.estado ?? "—").replace("_", " ")}
                    </Badge>
                    <div className="font-semibold">{formatCLP(c.total ?? 0)}</div>
                  </div>
                </a>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Comisiones pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {comisionesPendientes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin comisiones pendientes.</p>
            ) : (
              comisionesPendientes.map((c: any) => (
                <a
                  key={c.operadorId}
                  href={`/operadores/${c.operadorId}`}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-accent transition"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.nombre}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.servicios} servicios · pendiente
                    </div>
                  </div>
                  <div className="font-semibold">{formatCLP(c.monto)}</div>
                </a>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Costos del mes (top categorías)</CardTitle>
            <a href="/costos" className="text-sm text-muted-foreground hover:underline">
              Ver completo
            </a>
          </CardHeader>
          <CardContent style={{ height: 260 }}>
            {costosMes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin costos este mes.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costosMes} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => formatCLP(v)} />
                  <YAxis type="category" dataKey="categoria" width={130} />
                  <Tooltip formatter={(v: number) => formatCLP(v)} />
                  <Bar dataKey="monto" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------- Subcomponentes ----------
function KpiCard({
  title,
  value,
  icon,
  accent,
  delta,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
  delta?: number | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
        {delta != null && (
          <div className={`text-xs mt-1 ${delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}% vs período anterior
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FlotaRing({
  activa,
  mantencion,
  baja,
  total,
}: {
  activa: number;
  mantencion: number;
  baja: number;
  total: number;
}) {
  const safe = Math.max(total, 1);
  const rings = [
    { label: "Activa", value: activa, color: "#16a34a", radius: 62, width: 10, to: "/gruas?estado=activa" },
    { label: "Mantención", value: mantencion, color: "#f59e0b", radius: 48, width: 10, to: "/gruas?estado=en_mantencion" },
    { label: "Baja", value: baja, color: "#94a3b8", radius: 34, width: 10, to: "/gruas?estado=baja" },
  ];

  return (
    <div className="flex items-center gap-4">
      <svg width={160} height={160} viewBox="0 0 160 160">
        {rings.map((r) => {
          const c = 2 * Math.PI * r.radius;
          const len = (r.value / safe) * c;
          const dasharray = `${len} ${c - len}`;
          return (
            <g
              key={r.label}
              onClick={() => {
                window.location.href = r.to;
              }}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={80}
                cy={80}
                r={r.radius}
                fill="none"
                stroke="hsl(var(--muted))"
                strokeWidth={r.width}
              />
              <circle
                cx={80}
                cy={80}
                r={r.radius}
                fill="none"
                stroke={r.color}
                strokeWidth={r.width}
                strokeDasharray={dasharray}
                strokeDashoffset={0}
                transform="rotate(-90 80 80)"
                strokeLinecap="round"
              />
            </g>
          );
        })}
        <text x={80} y={78} textAnchor="middle" className="fill-foreground" fontSize={20} fontWeight={700}>
          {activa}/{total}
        </text>
        <text x={80} y={98} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          activas/total
        </text>
      </svg>
      <div className="space-y-1 text-sm">
        {rings.map((r) => (
          <a key={r.label} href={r.to} className="flex items-center gap-2 hover:underline">
            <span className="w-3 h-3 rounded-full" style={{ background: r.color }} />
            <span className="text-muted-foreground">{r.label}:</span>
            <span className="font-medium">{r.value}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function AlertRow({
  icon,
  title,
  subtitle,
  severity,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  severity: "critico" | "urgente" | "advertencia" | "pendiente";
  to: string;
}) {
  const variant =
    severity === "critico" || severity === "urgente"
      ? ("destructive" as const)
      : ("outline" as const);
  const badgeLabel =
    severity === "critico"
      ? "Crítico"
      : severity === "urgente"
        ? "Urgente"
        : severity === "advertencia"
          ? "Atención"
          : "Pendiente";
  return (
    <a
      href={to}
      className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-accent transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className={severity === "critico" || severity === "urgente" ? "text-destructive" : "text-amber-600"}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      <Badge variant={variant}>{badgeLabel}</Badge>
    </a>
  );
}
