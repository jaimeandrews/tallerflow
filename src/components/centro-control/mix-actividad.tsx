"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorIndicator } from "@/components/dashboard/error-indicator";
import type { MixActividadResponse } from "@/types/centro-control";

interface Props {
  data: MixActividadResponse | null;
  loading: boolean;
  error?: string | null;
}

export function MixActividad({ data, loading, error }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-slate-800">Mix de actividad · hoy</h2>
          <ErrorIndicator error={error ?? null} />
        </div>
      </div>

      {/* Loading */}
      {loading && !data && (
        <>
          <Skeleton className="h-4 w-full mb-3" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        </>
      )}

      {/* Empty */}
      {data && data.segmentos.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">Sin actividad registrada hoy.</p>
      )}

      {/* Datos */}
      {data && data.segmentos.length > 0 && (
        <>
          {/* Stacked bar */}
          <div className="flex h-4 w-full overflow-hidden rounded-md bg-slate-100">
            {data.segmentos.map((s) => (
              <div
                key={s.actividadId}
                className="h-full transition-all"
                style={{
                  width: `${s.porcentaje}%`,
                  backgroundColor: s.color,
                }}
                title={`${s.actividadNombre} · ${s.horas}h · ${s.porcentaje}%`}
              />
            ))}
          </div>

          {/* Leyenda 2 columnas */}
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {data.segmentos.map((s) => (
              <li key={s.actividadId} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate text-slate-600">{s.actividadNombre}</span>
                <span className="ml-auto font-bold tabular-nums text-slate-700">
                  {s.porcentaje}%
                </span>
              </li>
            ))}
          </ul>

          {/* Resumen */}
          <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
            <span className="text-green-700 font-semibold">
              Productivas: {data.productivasPct}%
            </span>
            {" · "}
            <span className="text-amber-700 font-semibold">
              No productivas: {data.noProductivasPct}%
            </span>
          </p>
        </>
      )}
    </div>
  );
}
