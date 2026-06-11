"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ErrorIndicator } from "./error-indicator";
import type { TimelineEvento, TimelineTono } from "@/types/dashboard";

interface Props {
  eventos: TimelineEvento[];
  loading: boolean;
  error: string | null;
}

const DOT_COLOR: Record<TimelineTono, string> = {
  blue: "bg-[#00AEEF] ring-[#00AEEF]/20",
  green: "bg-green-500 ring-green-500/20",
  yellow: "bg-amber-500 ring-amber-500/20",
  red: "bg-red-500 ring-red-500/20",
  gray: "bg-slate-400 ring-slate-400/20",
};

const TIPO_PREFIJO: Record<TimelineEvento["tipo"], string> = {
  inicio: "Inicio",
  fin: "Fin",
  pausa: "Pausa",
};

export function TimelineOperacional({ eventos, loading, error }: Props) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-slate-800">Timeline operacional</h2>
          <ErrorIndicator error={error} />
        </div>
        <p className="text-xs text-slate-500">Últimas marcaciones</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ maxHeight: 420 }}>
        {loading && eventos.length === 0 ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : eventos.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Sin marcaciones registradas hoy.
          </p>
        ) : (
          <ol className="relative">
            {eventos.map((ev, idx) => {
              const esUltimo = idx === eventos.length - 1;
              return (
                <li key={ev.id} className="relative grid grid-cols-[44px_14px_1fr] gap-2">
                  {/* Hora */}
                  <span className="pt-0.5 text-right font-mono text-[11px] font-bold tabular-nums text-slate-600">
                    {ev.hora}
                  </span>

                  {/* Dot + linea */}
                  <div className="relative flex flex-col items-center">
                    <span
                      className={cn(
                        "z-10 mt-1.5 h-2.5 w-2.5 rounded-full ring-4",
                        DOT_COLOR[ev.tono]
                      )}
                      aria-hidden
                    />
                    {!esUltimo && (
                      <span
                        className="absolute left-1/2 top-3 h-full w-px -translate-x-1/2 bg-slate-200"
                        aria-hidden
                      />
                    )}
                  </div>

                  {/* Contenido */}
                  <div className="pb-4">
                    <p className="text-xs leading-snug text-slate-700">
                      <span className="font-medium">{TIPO_PREFIJO[ev.tipo]}:</span> {ev.texto}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{ev.tecnico}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
