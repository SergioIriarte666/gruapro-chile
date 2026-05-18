import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleDollarSign,
  ClipboardList,
  Clock,
  Package,
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
  return {
    inicio: inicio.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
    inicioISO: inicio.toISOString(),
    finISO: fin.toISOString(),
  };
}

function Dashboard() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const r = useMemo(() => rangoPeriodo(periodo), [periodo]);
  const queryClient = useQueryClient();

  // ---------- KPIs ----------
  const { data: ingresos = 0 } = useQuery({
    queryKey: ["kpi-ingresos", r.inicio, r.fin],
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

  const { data: numServicios = 0 } = useQuery({
    queryKey: ["kpi-num-servicios", r.inicio, r.fin],
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

  const { data: porCobrar = 0 } = useQuery({
    queryKey: ["kpi-por-cobrar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("total")
        .in("estado", ["enviado", "con_folio", "facturado"]);
      if (error) throw error;
      return (data ?? []).reduce((s, x: any) => s + Number(x.total ?? 0), 0);
    },
  });

  const { data: costos = 0 } = useQuery({
    queryKey: ["kpi-costos", r.inicio, r.fin],
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

  // ---------- Alertas ----------
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: cierresAtrasados = [] } = useQuery({
    queryKey: ["alert-cierres-sin-folio"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cierres")
        .select("id,numero,updated_at,clientes(nombre)")
        .eq("estado", "enviado")
        .lt("updated_at", seteDiasAtras);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stockBajo = [] } = useQuery({
    queryKey: ["alert-stock-bajo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bodega_items")
        .select("id,nombre,stock_actual,stock_minimo");
      if (error) throw error;
      return (data ?? []).filter(
        (i: any) => Number(i.stock_actual ?? 0) < Number(i.stock_minimo ?? 0),
      );
    },
  });

  const { data: sinOperador = [] } = useQuery({
    queryKey: ["alert-sin-operador"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ordenes_servicio")
        .select("id,folio_interno")
        .eq("estado", "pendiente")
        .is("operador_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---------- Gráfico por tipo ----------
  const { data: porTipo = [] } = useQuery({
    queryKey: ["chart-por-tipo", r.inicio, r.fin],
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

  // ---------- Flota ----------
  const { data: flota = { activa: 0, en_mantencion: 0, baja: 0, total: 0 } } = useQuery({
    queryKey: ["flota-estados"],
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

  // ---------- Realtime ----------
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordenes_servicio" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kpi-ingresos"] });
          queryClient.invalidateQueries({ queryKey: ["kpi-num-servicios"] });
          queryClient.invalidateQueries({ queryKey: ["chart-por-tipo"] });
          queryClient.invalidateQueries({ queryKey: ["alert-sin-operador"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cierres" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["kpi-por-cobrar"] });
          queryClient.invalidateQueries({ queryKey: ["alert-cierres-sin-folio"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "costos" },
        () => queryClient.invalidateQueries({ queryKey: ["kpi-costos"] }),
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
          icon={<CircleDollarSign className="h-4 w-4" />}
          accent="text-green-600"
        />
        <KpiCard
          title="N° servicios"
          value={String(numServicios)}
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
          value={formatCLP(margen)}
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
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {cierresAtrasados.length === 0 &&
            stockBajo.length === 0 &&
            sinOperador.length === 0 && (
              <p className="text-sm text-muted-foreground">Todo en orden ✨</p>
            )}

          {cierresAtrasados.map((c: any) => (
            <AlertRow
              key={c.id}
              icon={<Clock className="h-4 w-4" />}
              variant="destructive"
              title={`Cierre ${c.numero ?? c.id.slice(0, 8)} sin folio hace +7 días`}
              subtitle={c.clientes?.nombre ?? "Cliente"}
              to={`/cierres/${c.id}`}
            />
          ))}

          {stockBajo.map((i: any) => (
            <AlertRow
              key={i.id}
              icon={<Package className="h-4 w-4" />}
              variant="warning"
              title={`Stock bajo: ${i.nombre}`}
              subtitle={`${i.stock_actual} / mínimo ${i.stock_minimo}`}
              to="/bodega"
            />
          ))}

          {sinOperador.map((o: any) => (
            <AlertRow
              key={o.id}
              icon={<UserX className="h-4 w-4" />}
              variant="warning"
              title={`Orden ${o.folio_interno ?? o.id.slice(0, 8)} sin operador asignado`}
              to={`/ordenes/${o.id}`}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Subcomponentes ----------
function KpiCard({
  title,
  value,
  icon,
  accent,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm text-muted-foreground font-medium">{title}</CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${accent ?? ""}`}>{value}</div>
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
  const segs = [
    { label: "Activa", value: activa, color: "#16a34a" },
    { label: "Mantención", value: mantencion, color: "#f59e0b" },
    { label: "Baja", value: baja, color: "#94a3b8" },
  ];
  const radius = 60;
  const stroke = 14;
  const c = 2 * Math.PI * radius;
  let acc = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx={80} cy={80} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        {segs.map((s, i) => {
          const len = (s.value / safe) * c;
          const dasharray = `${len} ${c - len}`;
          const offset = -acc;
          acc += len;
          return (
            <circle
              key={i}
              cx={80}
              cy={80}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={dasharray}
              strokeDashoffset={offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            />
          );
        })}
        <text x={80} y={76} textAnchor="middle" className="fill-foreground" fontSize={24} fontWeight={600}>
          {total}
        </text>
        <text x={80} y={94} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          grúas
        </text>
      </svg>
      <div className="space-y-1 text-sm">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}:</span>
            <span className="font-medium">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertRow({
  icon,
  title,
  subtitle,
  variant,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  variant: "destructive" | "warning";
  to: string;
}) {
  return (
    <a
      href={to}
      className="flex items-center justify-between gap-3 p-3 rounded-md border hover:bg-accent transition"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={
            variant === "destructive"
              ? "text-destructive"
              : "text-amber-600"
          }
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
      </div>
      <Badge variant={variant === "destructive" ? "destructive" : "outline"}>
        {variant === "destructive" ? "Urgente" : "Atención"}
      </Badge>
    </a>
  );
}
