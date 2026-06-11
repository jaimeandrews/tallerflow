/**
 * ProductivityBar — barra horizontal de productividad con porcentaje,
 * color dinámico y posicionamiento flexible del label.
 */

"use client";

import { cn } from "@/lib/utils";

export interface ProductivityBarThresholds {
  /** % mínimo para color verde. Default: 75. */
  good?: number;
  /** % mínimo para color ámbar (bajo este → rojo). Default: 50. */
  warn?: number;
}

export interface ProductivityBarProps {
  /** Valor de productividad en % (0–100). */
  value: number;
  /** Ancho visual de la barra en px. Default: 64. */
  barWidth?: number;
  /** Alto de la barra en px. Default: 6. */
  barHeight?: number;
  /** Mostrar el label de porcentaje. Default: true. */
  showLabel?: boolean;
  /** Posición del label respecto a la barra. Default: "left". */
  labelPosition?: "left" | "right";
  /** Ancho fijo del label en px (evita que la barra cambie de ancho). Default: 36. */
  labelWidth?: number;
  /** Umbrales para los colores. */
  thresholds?: ProductivityBarThresholds;
  className?: string;
}

const COLOR_GOOD = "bg-green-500";
const COLOR_WARN = "bg-amber-500";
const COLOR_BAD = "bg-red-500";

function colorClass(value: number, thresholds: Required<ProductivityBarThresholds>): string {
  if (value >= thresholds.good) return COLOR_GOOD;
  if (value >= thresholds.warn) return COLOR_WARN;
  return COLOR_BAD;
}

export function ProductivityBar({
  value,
  barWidth = 64,
  barHeight = 6,
  showLabel = true,
  labelPosition = "left",
  labelWidth = 36,
  thresholds = {},
  className,
}: ProductivityBarProps) {
  const resolved: Required<ProductivityBarThresholds> = {
    good: thresholds.good ?? 75,
    warn: thresholds.warn ?? 50,
  };

  const clampedPct = Math.max(0, Math.min(100, value));
  const bar = (
    <div
      className="overflow-hidden rounded-full bg-slate-100"
      style={{ width: barWidth, height: barHeight }}
      role="progressbar"
      aria-valuenow={clampedPct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all", colorClass(value, resolved))}
        style={{ width: `${clampedPct}%` }}
      />
    </div>
  );

  const label = showLabel && (
    <span
      className="shrink-0 text-right text-xs font-bold tabular-nums text-slate-800"
      style={{ width: labelWidth }}
    >
      {clampedPct}%
    </span>
  );

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {labelPosition === "left" && label}
      {bar}
      {labelPosition === "right" && label}
    </div>
  );
}
