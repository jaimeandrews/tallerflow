"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorIndicator } from "./error-indicator";
import type { ChartPoint, PeriodoChart } from "@/hooks/useDashboardProductividadChart";

const META_PRODUCTIVIDAD = 75;
const COLOR_LINEA = "#00AEEF";
const COLOR_META = "#7DD3FC";

interface Props {
  data: ChartPoint[];
  pico: { hora: string; valor: number };
  promedio: number;
  loading: boolean;
  error: string | null;
  periodo: PeriodoChart;
  onPeriodoChange: (p: PeriodoChart) => void;
}

const SUBTEXTO_POR_PERIODO: Record<PeriodoChart, string> = {
  hoy: "Hoy · % de HH productivas vs disponibles",
  "7d": "Últimos 7 días · % de HH productivas vs disponibles",
  "30d": "Últimos 30 días · % de HH productivas vs disponibles",
};

export function GraficoProductividad({
  data,
  pico,
  promedio,
  loading,
  error,
  periodo,
  onPeriodoChange,
}: Props) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold text-slate-800">Productividad operacional</h2>
            <ErrorIndicator error={error} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">{SUBTEXTO_POR_PERIODO[periodo]}</p>
        </div>

        <Tabs value={periodo} onValueChange={(v) => onPeriodoChange(v as PeriodoChart)}>
          <TabsList className="h-8">
            <TabsTrigger value="hoy" className="text-xs">
              Hoy
            </TabsTrigger>
            <TabsTrigger value="7d" className="text-xs">
              7d
            </TabsTrigger>
            <TabsTrigger value="30d" className="text-xs">
              30d
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Chart */}
      <div className="mt-4 flex-1 min-h-[220px]">
        {loading && data.length === 0 ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={220}>
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              <defs>
                <linearGradient id="prodArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLOR_LINEA} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLOR_LINEA} stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />

              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                width={36}
              />

              <ReferenceLine
                y={META_PRODUCTIVIDAD}
                stroke={COLOR_META}
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />

              <Tooltip
                cursor={{ stroke: "#CBD5E1", strokeWidth: 1, strokeDasharray: "3 3" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #E2E8F0",
                  fontSize: 12,
                  padding: "6px 10px",
                }}
                labelStyle={{ color: "#64748B", fontWeight: 500 }}
                formatter={(v) => [`${typeof v === "number" ? v : 0}%`, "Productividad"]}
              />

              <Area
                type="monotone"
                dataKey="productividad"
                stroke={COLOR_LINEA}
                strokeWidth={2}
                fill="url(#prodArea)"
                dot={{ r: 3, stroke: COLOR_LINEA, strokeWidth: 2, fill: "#fff" }}
                activeDot={{ r: 5, stroke: COLOR_LINEA, strokeWidth: 2, fill: "#fff" }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: COLOR_LINEA }}
          />
          Productividad
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t-2 border-dashed"
            style={{ borderColor: COLOR_META }}
          />
          Meta turno {META_PRODUCTIVIDAD}%
        </span>
        {pico.valor > 0 && (
          <span className="ml-auto font-medium text-slate-600">
            Pico {pico.hora} · {pico.valor}%
            <span className="ml-2 font-normal text-slate-400">Promedio {promedio}%</span>
          </span>
        )}
      </div>
    </div>
  );
}
