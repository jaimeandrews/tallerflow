"use client";

import { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ROLES_SUCURSAL_REPORT } from "@/types/reportes";
import type { SucursalProductividad } from "@/types/reportes";
import type { FiltroReporte } from "@/types/reportes-ui";
import type { RolUsuario } from "@/generated/prisma";

type SortKey = keyof Pick<
  SucursalProductividad,
  | "nombre"
  | "tecnicosActivos"
  | "ofTotal"
  | "ofFinalizadas"
  | "productividad"
  | "utilizacion"
  | "mttr"
  | "slaCumplimiento"
>;

interface Props {
  filtros: FiltroReporte;
  rol: RolUsuario;
  data: SucursalProductividad[];
  loading: boolean;
  error: string | null;
}

// ── Sparkline mini ─────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <span className="text-[10px] text-slate-300">—</span>;
  const W = 72;
  const H = 22;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - (Math.max(0, Math.min(100, v)) / 100) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Barra de productividad ─────────────────────────────────────────────────

function BarraPct({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.min(pct, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-bold tabular-nums text-slate-800">
        {pct}%
      </span>
    </div>
  );
}

function colorProductividad(pct: number): string {
  if (pct >= 75) return "#22C55E";
  if (pct >= 50) return "#F59E0B";
  return "#EF4444";
}

// ── Cards comparativas ─────────────────────────────────────────────────────

function SucursalCard({ s, esMejor }: { s: SucursalProductividad; esMejor: boolean }) {
  const color = colorProductividad(s.productividad);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm",
        esMejor ? "border-green-300 ring-2 ring-green-200" : "border-slate-200"
      )}
    >
      {esMejor && (
        <span className="absolute right-2 top-2 rounded-full bg-green-100 px-2 py-0.5 text-[9px] font-bold text-green-700">
          MEJOR
        </span>
      )}

      {/* Header */}
      <p className="truncate text-sm font-bold text-slate-800">{s.nombre}</p>
      <p className="mt-0.5 text-[10px] text-slate-500">
        {s.tecnicosActivos} técnicos · {s.ofTotal} OF
      </p>

      {/* Barra productividad */}
      <div className="mt-3">
        <p className="mb-1 text-[10px] text-slate-500">Productividad</p>
        <BarraPct pct={s.productividad} color={color} />
      </div>

      {/* KPIs en grid */}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <KpiRow label="Utilización" value={`${s.utilizacion}%`} />
        <KpiRow label="OF Fin." value={String(s.ofFinalizadas)} />
        <KpiRow label="MTTR" value={s.mttr > 0 ? `${s.mttr.toFixed(1)}h` : "—"} />
        <KpiRow label="SLA" value={`${s.slaCumplimiento}%`} />
      </dl>

      {/* Sparkline */}
      <div className="mt-3 flex items-end justify-between">
        <p className="text-[9px] text-slate-400">Tendencia productividad</p>
        <Sparkline data={s.tendencia} color={color} />
      </div>
    </div>
  );
}

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] text-slate-400">{label}</dt>
      <dd className="font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

// ── Tabla comparativa ──────────────────────────────────────────────────────

// Para cada columna numérica, definir si "mejor" es max o min.
const COL_MEJOR: Record<string, "max" | "min"> = {
  tecnicosActivos: "max",
  ofTotal: "max",
  ofFinalizadas: "max",
  productividad: "max",
  utilizacion: "max",
  mttr: "min",
  slaCumplimiento: "max",
};

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

function TablaComparativa({ data }: { data: SucursalProductividad[] }) {
  const [sortBy, setSortBy] = useState<SortKey>("productividad");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = useCallback((key: SortKey) => {
    setSortBy((prev) => {
      if (prev === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      else setSortDir("desc");
      return key;
    });
  }, []);

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const av = a[sortBy] as number | string;
      const bv = b[sortBy] as number | string;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sortBy, sortDir]);

  // Calcular mejor valor por columna numérica
  const mejores = useMemo(() => {
    const result: Partial<Record<SortKey, number | string>> = {};
    for (const [col, tipo] of Object.entries(COL_MEJOR) as [SortKey, "max" | "min"][]) {
      const vals = data.map((s) => s[col] as number);
      const mejor = tipo === "max" ? Math.max(...vals) : Math.min(...vals);
      result[col] = mejor;
    }
    return result;
  }, [data]);

  function isBest(row: SucursalProductividad, col: SortKey): boolean {
    if (data.length <= 1) return false;
    const best = mejores[col];
    const val = row[col] as number;
    return best !== undefined && val === best;
  }

  const SP = { currentKey: sortBy, currentDir: sortDir, onSort: handleSort };

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="border-b border-slate-100 bg-slate-50">
          <tr>
            <SortTh label="Sucursal" sortKey="nombre" className="pl-4" {...SP} />
            <SortTh label="Técnicos" sortKey="tecnicosActivos" {...SP} />
            <SortTh label="OF Total" sortKey="ofTotal" {...SP} />
            <SortTh label="OF Final." sortKey="ofFinalizadas" {...SP} />
            <SortTh label="Productividad" sortKey="productividad" {...SP} />
            <SortTh label="Utilización" sortKey="utilizacion" {...SP} />
            <SortTh label="MTTR" sortKey="mttr" {...SP} />
            <SortTh label="SLA" sortKey="slaCumplimiento" {...SP} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.sucursalId} className="border-b border-slate-50 last:border-0">
              {/* Sucursal */}
              <td className="py-2.5 pl-4 pr-3 align-middle text-sm font-semibold text-slate-800">
                {s.nombre}
              </td>

              {/* Técnicos */}
              <Td value={s.tecnicosActivos} best={isBest(s, "tecnicosActivos")}>
                {s.tecnicosActivos}
              </Td>

              {/* OF Total */}
              <Td value={s.ofTotal} best={isBest(s, "ofTotal")}>
                {s.ofTotal}
              </Td>

              {/* OF Finalizadas */}
              <Td value={s.ofFinalizadas} best={isBest(s, "ofFinalizadas")}>
                {s.ofFinalizadas}
              </Td>

              {/* Productividad */}
              <Td value={s.productividad} best={isBest(s, "productividad")}>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    s.productividad >= 75
                      ? "text-green-700"
                      : s.productividad >= 50
                        ? "text-amber-700"
                        : "text-red-700"
                  )}
                >
                  {s.productividad}%
                </span>
              </Td>

              {/* Utilización */}
              <Td value={s.utilizacion} best={isBest(s, "utilizacion")}>
                {s.utilizacion}%
              </Td>

              {/* MTTR — mejor = menor */}
              <Td value={s.mttr} best={isBest(s, "mttr")}>
                {s.mttr > 0 ? `${s.mttr.toFixed(1)}h` : "—"}
              </Td>

              {/* SLA */}
              <Td value={s.slaCumplimiento} best={isBest(s, "slaCumplimiento")}>
                <span
                  className={cn(
                    "font-semibold",
                    s.slaCumplimiento >= 90 ? "text-green-700" : "text-red-600"
                  )}
                >
                  {s.slaCumplimiento}%
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Td({
  best,
  children,
  value: _value,
}: {
  best: boolean;
  children: React.ReactNode;
  value: number | string;
}) {
  return (
    <td
      className={cn(
        "px-3 py-2.5 align-middle text-xs tabular-nums text-slate-700 transition-colors",
        best && "bg-green-50 font-semibold"
      )}
    >
      {best && (
        <span className="mr-1 text-[8px] text-green-600" aria-label="Mejor">
          ★
        </span>
      )}
      {children}
    </td>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function ReporteSucursales({ filtros, rol, data, loading, error }: Props) {
  if (!ROLES_SUCURSAL_REPORT.includes(rol)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
        <Lock className="h-6 w-6 text-slate-300" />
        <p className="text-sm text-slate-500">
          El reporte comparativo por sucursal solo está disponible para
          <br />
          Administradores, Gerentes de Sucursal y Control de Gestión.
        </p>
      </div>
    );
  }

  const mejorId = useMemo(
    () =>
      data.length > 1
        ? data.reduce((a, b) => (a.productividad >= b.productividad ? a : b)).sucursalId
        : null,
    [data]
  );

  if (loading && data.length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
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
        No hay datos de sucursales en el periodo seleccionado.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((s) => (
          <SucursalCard key={s.sucursalId} s={s} esMejor={s.sucursalId === mejorId} />
        ))}
      </div>

      {/* Leyenda cards */}
      <p className="text-xs text-slate-400">
        ★ = mejor de la métrica en el periodo · Card con borde verde = sucursal más productiva
      </p>

      {/* Tabla */}
      <TablaComparativa data={data} />
    </div>
  );
}
