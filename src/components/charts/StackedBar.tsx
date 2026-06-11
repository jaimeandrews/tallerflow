/**
 * StackedBar — barra horizontal apilada para visualizar distribución
 * de actividades, HH por técnico, etc.
 *
 * Acepta segmentos con valor absoluto (los normaliza a 100%) o con
 * porcentaje pre-calculado (pasando `normalized: true`).
 */

"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface StackedSegment {
  /** Identificador único del segmento. */
  id: string;
  /** Etiqueta mostrada en tooltip y leyenda. */
  label: string;
  /** Valor (puede ser HH, conteo, etc.) o porcentaje si `normalized=true`. */
  value: number;
  /** Color del segmento (hex o CSS color). */
  color: string;
  /** Etiqueta breve para leyenda condensada. */
  shortLabel?: string;
}

export interface StackedBarProps {
  segments: StackedSegment[];
  /** Alto de la barra en px. Default: 16. */
  height?: number;
  /** Si true, los valores ya son porcentajes (0–100). Default: false. */
  normalized?: boolean;
  /** Unidad de los valores para el tooltip (ej. "h", "%"). Default: "". */
  unit?: string;
  /** Muestra la leyenda debajo. Default: false. */
  showLegend?: boolean;
  /** Número de columnas de la leyenda. Default: 2. */
  legendCols?: 1 | 2 | 3;
  /** Formato del valor en tooltip (recibe el valor calculado). */
  formatValue?: (value: number, pct: number) => string;
  className?: string;
  /** Mínimo de ancho visible por segmento (en %) — evita segmentos invisibles. Default: 0.5. */
  minSegmentPct?: number;
}

export function StackedBar({
  segments,
  height = 16,
  normalized = false,
  unit = "",
  showLegend = false,
  legendCols = 2,
  formatValue,
  className,
  minSegmentPct = 0.5,
}: StackedBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const withPct = useMemo(() => {
    const nonEmpty = segments.filter((s) => s.value > 0);
    if (nonEmpty.length === 0) return [];

    if (normalized) {
      return nonEmpty.map((s) => ({
        ...s,
        pct: Math.max(minSegmentPct, Math.min(100, s.value)),
      }));
    }

    const total = nonEmpty.reduce((acc, s) => acc + s.value, 0);
    if (total === 0) return [];

    // Calcular porcentajes y aplicar mínimo de ancho
    const raw = nonEmpty.map((s) => ({ ...s, pct: (s.value / total) * 100 }));

    // Clamp mínimo
    return raw.map((s) => ({
      ...s,
      pct: Math.max(minSegmentPct, s.pct),
    }));
  }, [segments, normalized, minSegmentPct]);

  const total = useMemo(() => segments.reduce((acc, s) => acc + s.value, 0), [segments]);

  if (withPct.length === 0) {
    return (
      <div
        className={cn("overflow-hidden rounded-full bg-slate-100", className)}
        style={{ height }}
        role="img"
        aria-label="Sin datos"
      />
    );
  }

  const formatV = formatValue ?? ((v, pct) => `${v.toFixed(1)}${unit} (${Math.round(pct)}%)`);

  const cols = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" }[legendCols];

  return (
    <div className={cn("space-y-2", className)}>
      {/* Barra */}
      <div
        className="flex overflow-hidden rounded-full"
        style={{ height }}
        role="img"
        aria-label={`Distribución: ${withPct.map((s) => `${s.label} ${Math.round(s.pct)}%`).join(", ")}`}
      >
        {withPct.map((s) => (
          <div
            key={s.id}
            className="relative cursor-default transition-opacity"
            style={{
              width: `${s.pct}%`,
              backgroundColor: s.color,
              opacity: hoveredId && hoveredId !== s.id ? 0.4 : 1,
            }}
            onMouseEnter={() => setHoveredId(s.id)}
            onMouseLeave={() => setHoveredId(null)}
            title={formatV(s.value, s.pct)}
            aria-label={`${s.label}: ${formatV(s.value, s.pct)}`}
          />
        ))}
      </div>

      {/* Tooltip flotante (solo el hovered) */}
      {hoveredId &&
        (() => {
          const seg = withPct.find((s) => s.id === hoveredId);
          if (!seg) return null;
          return (
            <div
              className="pointer-events-none absolute z-50 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg"
              style={{ transform: "translate(-50%, -110%)" }}
            >
              <span
                className="inline-block h-2 w-2 rounded-sm mr-1.5 align-middle"
                style={{ backgroundColor: seg.color }}
              />
              <span className="font-semibold">{seg.label}</span>
              <span className="ml-1 text-slate-500">{formatV(seg.value, seg.pct)}</span>
            </div>
          );
        })()}

      {/* Leyenda */}
      {showLegend && (
        <ul className={cn("grid gap-x-3 gap-y-1.5", cols)}>
          {withPct.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-1.5 text-xs text-slate-600 cursor-default"
              onMouseEnter={() => setHoveredId(s.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: s.color }}
              />
              <span className="flex-1 truncate">{s.shortLabel ?? s.label}</span>
              <span className="ml-auto shrink-0 font-semibold tabular-nums text-slate-800">
                {s.value.toFixed(1)}
                {unit}
              </span>
              <span className="w-9 shrink-0 text-right tabular-nums text-slate-400">
                {total > 0 ? Math.round((s.value / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
