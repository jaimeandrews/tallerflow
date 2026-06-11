"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTimer } from "@/hooks/useTimer";
import { ESTADO_TECNICO_LABELS } from "@/lib/utils/constants";
import type { TecnicoEnTaller } from "@/types/dashboard";
import type { EstadoTecnico } from "@/generated/prisma";
import { useNocMode } from "./modo-noc";

const ESTADO_BAR: Record<EstadoTecnico, string> = {
  TRABAJANDO: "bg-green-500",
  PAUSA: "bg-yellow-400",
  ALMUERZO: "bg-blue-400",
  DETENIDO: "bg-red-500",
  DISPONIBLE: "bg-slate-400",
};

const ESTADO_BG_SUAVE: Record<EstadoTecnico, string> = {
  TRABAJANDO: "bg-green-50 text-green-700",
  PAUSA: "bg-yellow-50 text-yellow-700",
  ALMUERZO: "bg-blue-50 text-blue-700",
  DETENIDO: "bg-red-50 text-red-700",
  DISPONIBLE: "bg-slate-50 text-slate-600",
};

interface Props {
  tecnico: TecnicoEnTaller;
  onClick?: (tecnico: TecnicoEnTaller) => void;
}

function formatDuracionCorta(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// memo prevents the entire grid from re-rendering when unrelated centro-control
// state changes (e.g. socket reconnect, alert panel updates). The per-card
// useTimer still ticks independently every second — that is a local re-render.
export const TecCardLive = memo(function TecCardLive({ tecnico, onClick }: Props) {
  const { formatted, seconds } = useTimer(tecnico.inicio);
  const tieneActivo = tecnico.inicio !== null;
  const { nocMode } = useNocMode();

  // Flash al cambiar de estado
  const prevEstadoRef = useRef(tecnico.estado);
  const [isFlashing, setIsFlashing] = useState(false);
  useEffect(() => {
    if (prevEstadoRef.current !== tecnico.estado) {
      prevEstadoRef.current = tecnico.estado;
      setIsFlashing(true);
      const t = setTimeout(() => setIsFlashing(false), 1_200);
      return () => clearTimeout(t);
    }
  }, [tecnico.estado]);

  const handleClick = () => {
    onClick?.(tecnico);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white pt-1 pb-3 px-3 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md",
        isFlashing && "ring-2 ring-[#00AEEF] ring-offset-1"
      )}
    >
      {/* Barra de color superior — transición suave de color al cambiar estado */}
      <span
        className={cn(
          "absolute left-0 top-0 h-[3px] w-full transition-colors duration-500",
          ESTADO_BAR[tecnico.estado]
        )}
        aria-hidden
      />

      {/* Avatar + nombre */}
      <div className="mt-2 flex items-center gap-2">
        <Avatar className="h-7 w-7">
          <AvatarFallback
            style={{ backgroundColor: tecnico.color }}
            className="text-[10px] font-semibold text-white"
          >
            {tecnico.iniciales}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-800">{tecnico.nombre}</p>
          <p className="truncate text-[10px] text-slate-400 font-mono">{tecnico.id.slice(0, 8)}</p>
        </div>
      </div>

      {/* Pill de estado uppercase */}
      <div
        className={cn(
          "mt-2 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-center",
          ESTADO_BG_SUAVE[tecnico.estado]
        )}
      >
        {ESTADO_TECNICO_LABELS[tecnico.estado]}
      </div>

      {/* Actividad y OF */}
      <div className="mt-2 space-y-0.5 text-xs">
        <p className="truncate text-slate-700">
          {tecnico.actividad ?? <span className="italic text-slate-400">Sin actividad</span>}
        </p>
        <p className="truncate text-[11px] text-slate-500">
          {tecnico.ofActiva ?? <span className="italic text-slate-400">sin OF</span>}
        </p>
      </div>

      {/* Timer + pill detenido */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span
          className={cn(
            "font-mono font-bold tabular-nums text-slate-800",
            nocMode ? "text-xl" : "text-base"
          )}
        >
          {tieneActivo ? formatted : "—"}
        </span>
        {tecnico.estado === "DETENIDO" && tieneActivo && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
            +{formatDuracionCorta(seconds)}
          </span>
        )}
      </div>
    </button>
  );
});

export function TecCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white pt-1 pb-3 px-3 shadow-sm">
      <span className="absolute left-0 top-0 h-[3px] w-full bg-slate-200" aria-hidden />
      <div className="mt-2 flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2 w-16" />
        </div>
      </div>
      <Skeleton className="mt-2 h-5 w-full" />
      <div className="mt-2 space-y-1">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="mt-2 h-5 w-20" />
    </div>
  );
}
