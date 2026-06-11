"use client";

import { memo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTimer } from "@/hooks/useTimer";
import { cn } from "@/lib/utils";
import { ESTADO_TECNICO_COLORS, ESTADO_TECNICO_LABELS } from "@/lib/utils/constants";
import type { TecnicoEnTaller } from "@/types/dashboard";

const RING_COLOR: Record<TecnicoEnTaller["estado"], string> = {
  TRABAJANDO: "ring-green-500",
  PAUSA: "ring-yellow-400",
  ALMUERZO: "ring-blue-400",
  DETENIDO: "ring-red-500",
  DISPONIBLE: "ring-slate-300",
};

const PILL_COLOR: Record<TecnicoEnTaller["estado"], string> = {
  TRABAJANDO: "bg-green-100 text-green-700",
  PAUSA: "bg-yellow-100 text-yellow-700",
  ALMUERZO: "bg-blue-100 text-blue-700",
  DETENIDO: "bg-red-100 text-red-700",
  DISPONIBLE: "bg-slate-100 text-slate-600",
};

interface Props {
  tecnico: TecnicoEnTaller;
}

// memo prevents the parent list from re-rendering ALL rows when only the
// dashboard KPI state changes. Each row's own useTimer still ticks every
// second independently — that re-render is local to TecRowLive itself.
export const TecRowLive = memo(function TecRowLive({ tecnico }: Props) {
  const { formatted } = useTimer(tecnico.inicio);
  const tieneActivo = tecnico.inicio !== null;
  const subtexto = tecnico.actividad
    ? tecnico.ofActiva
      ? `${tecnico.actividad} · ${tecnico.ofActiva}`
      : tecnico.actividad
    : "Sin marcaje activo";

  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
      <Avatar
        className={cn("h-7 w-7 ring-2 ring-offset-2 ring-offset-white", RING_COLOR[tecnico.estado])}
      >
        <AvatarFallback
          style={{ backgroundColor: tecnico.color }}
          className="text-[10px] font-semibold text-white"
        >
          {tecnico.iniciales}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-slate-800">{tecnico.nombre}</span>
        <span className="truncate text-xs text-slate-500">{subtexto}</span>
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            PILL_COLOR[tecnico.estado]
          )}
        >
          <span
            className={cn(
              "mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle",
              ESTADO_TECNICO_COLORS[tecnico.estado]
            )}
          />
          {ESTADO_TECNICO_LABELS[tecnico.estado]}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-slate-500">
          {tieneActivo ? formatted : "—"}
        </span>
      </div>
    </div>
  );
});
