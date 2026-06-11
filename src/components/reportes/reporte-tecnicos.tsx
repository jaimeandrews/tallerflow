"use client";

import { useState, useMemo, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { ChevronUp, ChevronDown, ChevronsUpDown, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TecnicoProductividad } from "@/types/reportes";
import type { FiltroReporte } from "@/types/reportes-ui";

// ── Types ──────────────────────────────────────────────────────────────────

type SortKey =
  | "nombre"
  | "productividad"
  | "hhProductivas"
  | "hhNoProductivas"
  | "hhTotal"
  | "diasTrabajados"
  | "promedioHHDia"
  | "ofAtendidas";

interface Props {
  filtros: FiltroReporte;
  data: TecnicoProductividad[];
  loading: boolean;
  error: string | null;
}

// ── Sparkline SVG ──────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) {
    return <span className="text-[10px] text-slate-300 font-mono">—</span>;
  }
  const W = 80;
  const H = 20;

  const nonZero = data.filter((v) => v > 0);
  if (nonZero.length === 0) {
    return <span className="text-[10px] text-slate-300 font-mono">sin datos</span>;
  }

  const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  const strokeColor = avg >= 75 ? "#22C55E" : avg >= 50 ? "#F59E0B" : "#EF4444";

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - (Math.max(0, Math.min(100, v)) / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={W}
      height={H}
      className="overflow-visible"
      aria-label={`Tendencia: ${data.map((v) => `${v}%`).join(", ")}`}
    >
      {/* Base line at 75% */}
      <line
        x1={0}
        y1={H * 0.25}
        x2={W}
        y2={H * 0.25}
        stroke="#E2E8F0"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Barra de productividad inline ─────────────────────────────────────────

function BarraProductividad({ pct }: { pct: number }) {
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 text-right text-xs font-bold tabular-nums text-slate-800">{pct}%</span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full transition-all", color)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Sort header cell ───────────────────────────────────────────────────────

function SortTh({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  currentDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={cn(
        "cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700",
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? (
          currentDir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

// ── Panel de detalle (Sheet) ───────────────────────────────────────────────

function PanelDetalleTecnico({
  tecnico,
  open,
  onClose,
  fechas,
}: {
  tecnico: TecnicoProductividad | null;
  open: boolean;
  onClose: () => void;
  fechas: string[];
}) {
  if (!tecnico) return null;

  const tendenciaData = tecnico.tendencia.map((v, i) => ({
    label: fechas[i] ? fechas[i].slice(5) : `D${i + 1}`, // MM-DD
    productividad: v,
  }));

  const totalHH = tecnico.hhTotal;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback
                style={{ backgroundColor: tecnico.color }}
                className="text-sm font-semibold text-white"
              >
                {tecnico.iniciales}
              </AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle className="text-lg">{tecnico.nombre}</SheetTitle>
              <p className="text-xs text-slate-500">
                {tecnico.hhTotal.toFixed(1)}h · {tecnico.diasTrabajados} días ·{" "}
                {tecnico.productividad}% productividad
              </p>
            </div>
          </div>
        </SheetHeader>

        {/* Stacked bar desglose */}
        <section className="mb-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Mix de actividades
          </h3>
          {tecnico.desglosePorActividad.length === 0 ? (
            <p className="text-xs text-slate-400">Sin actividades registradas.</p>
          ) : (
            <>
              <div className="flex h-4 w-full overflow-hidden rounded-md bg-slate-100">
                {tecnico.desglosePorActividad.map((d) => (
                  <div
                    key={d.actividadId}
                    style={{
                      width: `${d.porcentaje}%`,
                      backgroundColor: d.color,
                    }}
                    title={`${d.nombre} ${d.porcentaje}%`}
                    className="h-full"
                  />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
                {tecnico.desglosePorActividad.map((d) => (
                  <li key={d.actividadId} className="flex items-center gap-1.5 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ backgroundColor: d.color }}
                    />
                    <span className="truncate text-slate-600">{d.nombre}</span>
                    <span className="ml-auto font-bold tabular-nums text-slate-700">
                      {d.hh.toFixed(1)}h
                    </span>
                    <span className="w-8 text-right text-slate-400">{d.porcentaje}%</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-slate-400">
                <span className="font-semibold text-green-700">
                  Productivas:{" "}
                  {totalHH > 0 ? Math.round((tecnico.hhProductivas / totalHH) * 100) : 0}%
                </span>
                {" · "}
                <span className="font-semibold text-amber-700">
                  No productivas:{" "}
                  {totalHH > 0 ? Math.round((tecnico.hhNoProductivas / totalHH) * 100) : 0}%
                </span>
              </p>
            </>
          )}
        </section>

        {/* Tendencia */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tendencia de productividad — {fechas.length} días
          </h3>
          {tendenciaData.length < 2 ? (
            <p className="text-xs text-slate-400">Insuficientes datos para el gráfico.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={tendenciaData} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(tendenciaData.length / 7) - 1)}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine y={75} stroke="#7DD3FC" strokeDasharray="4 4" strokeWidth={1.5} />
                <Tooltip
                  formatter={(v) => [`${typeof v === "number" ? v : 0}%`, "Productividad"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 11 }}
                />
                <Line
                  type="monotone"
                  dataKey="productividad"
                  stroke="#00AEEF"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function ReporteTecnicos({ filtros, data, loading, error }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>("productividad");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSort = useCallback((key: SortKey) => {
    setSortBy((prev) => {
      if (prev === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      else {
        setSortDir("desc");
      }
      return key;
    });
  }, []);

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      let av: number | string = a[sortBy] as number | string;
      let bv: number | string = b[sortBy] as number | string;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sortBy, sortDir]);

  const maxPct = sorted.length > 0 ? sorted[0].productividad : -1;
  const minPct = sorted.length > 1 ? sorted[sorted.length - 1].productividad : -1;

  const selected = data.find((t) => t.tecnicoId === selectedId) ?? null;

  // Generate date labels from desde–hasta for the detail chart
  const fechas = useMemo(() => {
    const result: string[] = [];
    if (!filtros.desde || !filtros.hasta) return result;
    const cur = new Date(`${filtros.desde}T00:00:00Z`);
    const hasta = new Date(`${filtros.hasta}T00:00:00Z`);
    while (cur <= hasta) {
      result.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return result;
  }, [filtros.desde, filtros.hasta]);

  const SORT_PROPS = {
    currentKey: sortBy,
    currentDir: sortDir,
    onSort: handleSort,
  };

  if (loading && data.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-600">
        {error}
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center text-sm text-slate-500">
        No hay marcajes de técnicos en el periodo seleccionado.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-slate-100 bg-slate-50">
            <tr>
              <SortTh label="Técnico" sortKey="nombre" className="pl-4" {...SORT_PROPS} />
              <SortTh label="Productividad" sortKey="productividad" {...SORT_PROPS} />
              <SortTh label="HH Prod." sortKey="hhProductivas" {...SORT_PROPS} />
              <SortTh label="HH No Prod." sortKey="hhNoProductivas" {...SORT_PROPS} />
              <SortTh label="HH Total" sortKey="hhTotal" {...SORT_PROPS} />
              <SortTh label="Días" sortKey="diasTrabajados" {...SORT_PROPS} />
              <SortTh label="Prom/día" sortKey="promedioHHDia" {...SORT_PROPS} />
              <SortTh label="OF" sortKey="ofAtendidas" {...SORT_PROPS} />
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tendencia
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => {
              const isBest = t.productividad === maxPct && sorted.length > 1;
              const isWorst = t.productividad === minPct && sorted.length > 1 && minPct !== maxPct;
              return (
                <tr
                  key={t.tecnicoId}
                  onClick={() => setSelectedId(t.tecnicoId)}
                  className={cn(
                    "cursor-pointer border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50",
                    isBest && "bg-green-50/60 hover:bg-green-50",
                    isWorst && "bg-red-50/50 hover:bg-red-50"
                  )}
                >
                  {/* Técnico */}
                  <td className="py-2.5 pl-4 pr-3 align-middle">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback
                          style={{ backgroundColor: t.color }}
                          className="text-[10px] font-semibold text-white"
                        >
                          {t.iniciales}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate max-w-[140px] text-sm font-medium text-slate-800">
                        {t.nombre}
                      </span>
                      {isBest && (
                        <span className="shrink-0 rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-700">
                          TOP
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Productividad */}
                  <td className="px-3 py-2.5 align-middle">
                    <BarraProductividad pct={t.productividad} />
                  </td>

                  {/* HH Prod */}
                  <td className="px-3 py-2.5 align-middle font-mono text-xs tabular-nums text-green-700">
                    {t.hhProductivas.toFixed(1)}h
                  </td>

                  {/* HH No Prod */}
                  <td className="px-3 py-2.5 align-middle font-mono text-xs tabular-nums text-amber-700">
                    {t.hhNoProductivas.toFixed(1)}h
                  </td>

                  {/* HH Total */}
                  <td className="px-3 py-2.5 align-middle font-mono text-xs font-semibold tabular-nums text-slate-800">
                    {t.hhTotal.toFixed(1)}h
                  </td>

                  {/* Días */}
                  <td className="px-3 py-2.5 align-middle text-xs text-slate-600">
                    {t.diasTrabajados}
                  </td>

                  {/* Prom/día */}
                  <td className="px-3 py-2.5 align-middle font-mono text-xs tabular-nums text-slate-600">
                    {t.promedioHHDia.toFixed(1)}h
                  </td>

                  {/* OF */}
                  <td className="px-3 py-2.5 align-middle text-center text-xs font-medium text-slate-600">
                    {t.ofAtendidas}
                  </td>

                  {/* Tendencia */}
                  <td className="px-3 py-2.5 align-middle">
                    <Sparkline data={t.tendencia} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-green-50 ring-1 ring-green-300" />
          Técnico más productivo del periodo
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-red-50 ring-1 ring-red-300" />
          Técnico menos productivo del periodo
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <span className="text-slate-400">Click en fila para ver detalle ↗</span>
        </span>
      </div>

      {/* Panel detalle */}
      <PanelDetalleTecnico
        tecnico={selected}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
        fechas={fechas}
      />
    </>
  );
}
