"use client";

import { useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorIndicator } from "@/components/dashboard/error-indicator";
import { cn } from "@/lib/utils";
import { useNocMode } from "./modo-noc";
import type { RibbonOF, RibbonResponse, RibbonSegmento } from "@/types/centro-control";

interface Props {
  data: RibbonResponse | null;
  loading: boolean;
  error?: string | null;
}

const NOW_TICK_MS = 30_000;

function formatHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function OFRibbonTimeline({ data, loading, error }: Props) {
  const { nocMode } = useNocMode();

  // Tick para crecer segmentos activos en tiempo real.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const { rangoInicioMs, rangoMs, horasMarcas, nowPct } = useMemo(() => {
    if (!data || now === null) {
      return { rangoInicioMs: 0, rangoMs: 0, horasMarcas: [] as number[], nowPct: 0 };
    }
    const ini = new Date(data.rangoInicio).getTime();
    const fin = new Date(data.rangoFin).getTime();
    const total = Math.max(1, fin - ini);
    const horaInicio = new Date(data.rangoInicio).getHours();
    const horaFin = new Date(data.rangoFin).getHours();
    const horas: number[] = [];
    for (let h = horaInicio; h <= horaFin; h++) horas.push(h);
    const np = ((now - ini) / total) * 100;
    return {
      rangoInicioMs: ini,
      rangoMs: total,
      horasMarcas: horas,
      nowPct: Math.max(0, Math.min(100, np)),
    };
  }, [data, now]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold text-slate-800">
              Ribbon de OF activas · líneas de tiempo
            </h2>
            <ErrorIndicator error={error ?? null} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Hoy · {String(new Date(data?.rangoInicio ?? Date.now()).getHours()).padStart(2, "0")}h–
            {String(new Date(data?.rangoFin ?? Date.now()).getHours()).padStart(2, "0")}h
          </p>
        </div>

        <Leyenda />
      </div>

      {/* Eje de horas */}
      {data && now !== null && (
        <div className="grid grid-cols-[150px_1fr_90px] gap-2 mb-1.5">
          <div />
          <div className="relative h-4">
            {horasMarcas.map((h, idx) => {
              const pct = (idx / Math.max(1, horasMarcas.length - 1)) * 100;
              return (
                <span
                  key={h}
                  className="absolute -translate-x-1/2 text-[10px] font-mono text-slate-400"
                  style={{ left: `${pct}%` }}
                >
                  {String(h).padStart(2, "0")}h
                </span>
              );
            })}
          </div>
          <div />
        </div>
      )}

      {/* Rows */}
      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[150px_1fr_90px] gap-2 items-center">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      ) : !data || data.ordenes.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">
          No hay OF con marcajes hoy en el rango operativo.
        </p>
      ) : (
        <div
          className={cn(
            "space-y-1.5",
            // En modo NOC, si hay muchas OF habilitamos scroll vertical.
            nocMode && "max-h-[320px] overflow-y-auto pr-1"
          )}
        >
          {data.ordenes.map((of) => (
            <RibbonRow
              key={of.id}
              of={of}
              rangoInicioMs={rangoInicioMs}
              rangoMs={rangoMs}
              now={now ?? Date.now()}
              nowPct={nowPct}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  of: RibbonOF;
  rangoInicioMs: number;
  rangoMs: number;
  now: number;
  nowPct: number;
}

function RibbonRow({ of, rangoInicioMs, rangoMs, now, nowPct }: RowProps) {
  return (
    <div className="grid grid-cols-[150px_1fr_90px] gap-2 items-center">
      {/* Label */}
      <div className="min-w-0 leading-tight">
        <p className="truncate font-mono text-xs font-bold text-slate-800">{of.numero}</p>
        <p className="truncate text-[10px] text-slate-500">{of.nombre}</p>
      </div>

      {/* Timeline track */}
      <div className="relative h-6 overflow-hidden rounded bg-slate-50 ring-1 ring-slate-100">
        {of.segmentos.map((s, i) => (
          <SegmentDiv
            key={i}
            segmento={s}
            rangoInicioMs={rangoInicioMs}
            rangoMs={rangoMs}
            now={now}
          />
        ))}
        {/* Línea NOW */}
        <span
          className="absolute top-0 bottom-0 z-20 w-[2px] bg-red-500"
          style={{ left: `${nowPct}%` }}
          aria-hidden
        />
      </div>

      {/* Estado pill */}
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold border border-transparent",
          of.estadoColorClass
        )}
      >
        {of.estadoLabel}
      </span>
    </div>
  );
}

function SegmentDiv({
  segmento,
  rangoInicioMs,
  rangoMs,
  now,
}: {
  segmento: RibbonSegmento;
  rangoInicioMs: number;
  rangoMs: number;
  now: number;
}) {
  const sInicio = new Date(segmento.inicio).getTime();
  const sFin = segmento.fin ? new Date(segmento.fin).getTime() : now;
  const left = Math.max(0, ((sInicio - rangoInicioMs) / rangoMs) * 100);
  const right = Math.max(0, Math.min(100, ((sFin - rangoInicioMs) / rangoMs) * 100));
  const width = Math.max(0.5, right - left);
  const activo = segmento.fin === null;

  return (
    <span
      className={cn(
        "absolute top-0 bottom-0 transition-all duration-300",
        activo && "opacity-90 ring-1 ring-white/40"
      )}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        backgroundColor: segmento.color,
      }}
      title={`${segmento.actividadNombre} · ${formatHHMM(segmento.inicio)}–${
        segmento.fin ? formatHHMM(segmento.fin) : "ahora"
      }`}
    />
  );
}

function Leyenda() {
  const items: { label: string; color: string }[] = [
    { label: "Trabajando", color: "#00AEEF" },
    { label: "Pausa", color: "#F4A91A" },
    { label: "Espera repuesto", color: "#E82C2C" },
  ];
  return (
    <div className="hidden md:flex items-center gap-3 text-[10px] text-slate-500">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
