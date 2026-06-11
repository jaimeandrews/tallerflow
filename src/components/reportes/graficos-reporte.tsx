"use client";

import {
  Bar,
  Line,
  ComposedChart,
  LineChart,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import type { TecnicoProductividad, SucursalProductividad } from "@/types/reportes";
import type { HHDiaria } from "@/hooks/useHHDiarias";
import type { FiltroReporte } from "@/types/reportes-ui";

const META_PRODUCTIVIDAD = 75;
const COLORES_LINEA = [
  "#00AEEF",
  "#0090CC",
  "#F47920",
  "#22C55E",
  "#8B5CF6",
  "#EC4899",
  "#F59E0B",
  "#10B981",
  "#6366F1",
  "#EF4444",
];
const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #E2E8F0",
  fontSize: 11,
  padding: "6px 10px",
};

// ── Prop types ─────────────────────────────────────────────────────────────

interface Props {
  filtros: FiltroReporte;
  tecnicosData: TecnicoProductividad[];
  sucursalesData: SucursalProductividad[];
  hhDiarias: HHDiaria[];
  loadingTec: boolean;
  loadingSuc: boolean;
  loadingHH: boolean;
}

// ── Date range helper ──────────────────────────────────────────────────────

function rangoFechas(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  const cur = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  while (cur <= fin) {
    fechas.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return fechas;
}

// ── 1. LineChart de tendencia ──────────────────────────────────────────────

function GraficoTendencia({
  filtros,
  tecnicosData,
  sucursalesData,
  loadingTec,
  loadingSuc,
}: Pick<Props, "filtros" | "tecnicosData" | "sucursalesData" | "loadingTec" | "loadingSuc">) {
  const esTecnicos = filtros.tipo === "tecnicos";
  const esSucursales = filtros.tipo === "sucursales";
  if (!esTecnicos && !esSucursales) return null;

  const fechas = rangoFechas(filtros.desde, filtros.hasta);
  const loading = esTecnicos ? loadingTec : loadingSuc;

  const dataset = fechas.map((f, i) => {
    const punto: Record<string, string | number> = { label: f.slice(5) };
    if (esTecnicos) {
      for (const t of tecnicosData) punto[t.nombre] = t.tendencia[i] ?? 0;
    } else {
      for (const s of sucursalesData) punto[s.nombre] = s.tendencia[i] ?? 0;
    }
    return punto;
  });

  const lineas = esTecnicos
    ? tecnicosData.map((t, i) => ({
        key: t.nombre,
        color: COLORES_LINEA[i % COLORES_LINEA.length],
      }))
    : sucursalesData.map((s, i) => ({
        key: s.nombre,
        color: COLORES_LINEA[i % COLORES_LINEA.length],
      }));

  const titulo = esTecnicos
    ? "Tendencia de productividad por técnico"
    : "Tendencia de productividad por sucursal";

  if (loading && lineas.length === 0) return <Skeleton className="h-52 w-full" />;

  return (
    <ChartCard titulo={titulo} subtitulo="Productividad diaria %">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={dataset} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(dataset.length / 8) - 1)}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <ReferenceLine
            y={META_PRODUCTIVIDAD}
            stroke="#7DD3FC"
            strokeDasharray="4 4"
            strokeWidth={1.5}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v) => [`${typeof v === "number" ? v : 0}%`]}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {lineas.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              stroke={l.color}
              strokeWidth={1.8}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── 2. Donut de distribución de actividades ────────────────────────────────

function GraficoDonutActividades({
  tecnicosData,
  loadingTec,
}: Pick<Props, "tecnicosData" | "loadingTec">) {
  const agregado = new Map<string, { nombre: string; color: string; hh: number }>();
  for (const t of tecnicosData) {
    for (const d of t.desglosePorActividad) {
      const ex = agregado.get(d.actividadId);
      if (ex) ex.hh += d.hh;
      else agregado.set(d.actividadId, { nombre: d.nombre, color: d.color, hh: d.hh });
    }
  }
  const pieData = [...agregado.values()].filter((a) => a.hh > 0).sort((a, b) => b.hh - a.hh);
  const totalHH = pieData.reduce((s, a) => s + a.hh, 0);

  if (loadingTec && pieData.length === 0) return <Skeleton className="h-52 w-full" />;
  if (pieData.length === 0) return null;

  return (
    <ChartCard titulo="Distribución de actividades" subtitulo="HH totales del periodo">
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="hh"
              nameKey="nombre"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={80}
              strokeWidth={1}
              stroke="#fff"
              isAnimationActive={false}
            >
              {pieData.map((a, i) => (
                <Cell key={i} fill={a.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v) => [`${typeof v === "number" ? v.toFixed(1) : v}h`, "HH"]}
            />
          </PieChart>
        </ResponsiveContainer>
        <ul className="flex-1 space-y-1.5">
          {pieData.map((a) => (
            <li key={a.nombre} className="flex items-center gap-2 text-xs">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: a.color }}
              />
              <span className="flex-1 truncate text-slate-700">{a.nombre}</span>
              <span className="font-mono font-semibold tabular-nums text-slate-800">
                {a.hh.toFixed(1)}h
              </span>
              <span className="w-9 text-right tabular-nums text-slate-400">
                {totalHH > 0 ? Math.round((a.hh / totalHH) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

// ── 3. BarChart HH por día ─────────────────────────────────────────────────

function GraficoHHPorDia({ hhDiarias, loadingHH }: Pick<Props, "hhDiarias" | "loadingHH">) {
  const hasDays = hhDiarias.some((d) => d.hhProductivas + d.hhNoProductivas > 0);
  if (loadingHH && !hasDays) return <Skeleton className="h-52 w-full" />;

  return (
    <ChartCard
      titulo="HH registradas por día"
      subtitulo="Productivas (azul) vs No productivas (gris) · línea ámbar = 8h de referencia"
    >
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={hhDiarias} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            interval={Math.max(0, Math.floor(hhDiarias.length / 8) - 1)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            width={32}
            tickFormatter={(v) => `${v}h`}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(v, name) => [
              `${typeof v === "number" ? v.toFixed(1) : v}h`,
              name === "hhProductivas" ? "Productivas" : "No productivas",
            ]}
          />
          <Legend
            iconSize={8}
            iconType="square"
            formatter={(v) => (v === "hhProductivas" ? "Productivas" : "No productivas")}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          <Bar
            dataKey="hhProductivas"
            stackId="hh"
            fill="#00AEEF"
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Bar
            dataKey="hhNoProductivas"
            stackId="hh"
            fill="#CBD5E1"
            radius={[3, 3, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
          {hasDays && (
            <Line
              type="monotone"
              dataKey={() => 8}
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────────

function ChartCard({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-800">{titulo}</h3>
        <p className="text-xs text-slate-500">{subtitulo}</p>
      </div>
      {children}
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function GraficosReporte({
  filtros,
  tecnicosData,
  sucursalesData,
  hhDiarias,
  loadingTec,
  loadingSuc,
  loadingHH,
}: Props) {
  const mostrarDonut = filtros.tipo === "tecnicos";
  const mostrarTendencia = filtros.tipo === "tecnicos" || filtros.tipo === "sucursales";

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Gráficos del periodo
      </h2>

      {mostrarTendencia && (
        <div className={mostrarDonut ? "grid gap-4 lg:grid-cols-[1fr_300px]" : "space-y-4"}>
          <GraficoTendencia
            filtros={filtros}
            tecnicosData={tecnicosData}
            sucursalesData={sucursalesData}
            loadingTec={loadingTec}
            loadingSuc={loadingSuc}
          />
          {mostrarDonut && (
            <GraficoDonutActividades tecnicosData={tecnicosData} loadingTec={loadingTec} />
          )}
        </div>
      )}

      <GraficoHHPorDia hhDiarias={hhDiarias} loadingHH={loadingHH} />
    </section>
  );
}
