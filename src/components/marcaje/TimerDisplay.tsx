"use client";

import { useTimer } from "@/hooks/useTimer";
import { ESTADO_CONFIG } from "./EstadoPill";
import { cn } from "@/lib/utils";

type Estado = keyof typeof ESTADO_CONFIG;

interface TimerDisplayProps {
  horaInicio: string | null;
  estado: string;
  actividadNombre?: string;
  size?: "lg" | "md";
  className?: string;
}

export function TimerDisplay({
  horaInicio,
  estado,
  actividadNombre,
  size = "lg",
  className,
}: TimerDisplayProps) {
  const { formatted } = useTimer(horaInicio);
  const color = ESTADO_CONFIG[estado as Estado]?.color ?? "#6E7278";

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {actividadNombre && (
        <p className="text-sm font-medium tracking-wide" style={{ color }}>
          {actividadNombre} · {ESTADO_CONFIG[estado as Estado]?.label.toLowerCase() ?? "disponible"}
        </p>
      )}

      <div
        className={cn(
          "font-mono tabular-nums font-bold leading-none select-none",
          size === "lg" ? "text-[clamp(72px,12vw,130px)]" : "text-[clamp(48px,8vw,80px)]"
        )}
        style={{ color, textShadow: `0 0 60px ${color}50` }}
      >
        {formatted}
      </div>
    </div>
  );
}
