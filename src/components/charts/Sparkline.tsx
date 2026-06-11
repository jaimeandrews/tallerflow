/**
 * Sparkline — SVG polyline mini para uso en tablas y cards.
 *
 * Renderiza una polilínea sobre un área de `width × height` px.
 * Todos los props son opcionales excepto `data`.
 */

"use client";

import { useMemo } from "react";

export interface SparklineProps {
  /** Valores del eje Y (por ejemplo, productividad % de cada día). */
  data: number[];
  /** Ancho del SVG en px. Default: 80. */
  width?: number;
  /** Alto del SVG en px. Default: 20. */
  height?: number;
  /** Color de la línea. Si no se provee, se calcula automáticamente de la media. */
  color?: string;
  /** Línea de referencia horizontal punteada (ej. 75 = meta de productividad). */
  referenceY?: number;
  /** Valor mínimo del rango Y. Default: 0. */
  min?: number;
  /** Valor máximo del rango Y. Default: 100. */
  max?: number;
  /** Grosor de la línea. Default: 1.5. */
  strokeWidth?: number;
  /** className del SVG raíz. */
  className?: string;
  /** Etiqueta accesible. Se genera automáticamente si no se provee. */
  ariaLabel?: string;
}

const COLOR_GOOD = "#22C55E";
const COLOR_WARN = "#F59E0B";
const COLOR_BAD = "#EF4444";

function autoColor(data: number[], min: number, max: number): string {
  const range = max - min || 1;
  const nonZero = data.filter((v) => v > 0);
  if (nonZero.length === 0) return COLOR_BAD;
  const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
  const pct = ((avg - min) / range) * 100;
  if (pct >= 75) return COLOR_GOOD;
  if (pct >= 50) return COLOR_WARN;
  return COLOR_BAD;
}

export function Sparkline({
  data,
  width = 80,
  height = 20,
  color,
  referenceY,
  min = 0,
  max = 100,
  strokeWidth = 1.5,
  className,
  ariaLabel,
}: SparklineProps) {
  const { points, refLineY, lineColor } = useMemo(() => {
    const range = max - min || 1;
    const lineColor = color ?? autoColor(data, min, max);

    // Convertir datos a coordenadas SVG
    const pts =
      data.length < 2
        ? ""
        : data
            .map((v, i) => {
              const x = (i / (data.length - 1)) * width;
              const clamped = Math.max(min, Math.min(max, v));
              const y = height - ((clamped - min) / range) * height;
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(" ");

    // Posición Y de la línea de referencia (si existe)
    const refLineY =
      referenceY !== undefined
        ? height - ((Math.max(min, Math.min(max, referenceY)) - min) / range) * height
        : null;

    return { points: pts, refLineY, lineColor };
  }, [data, width, height, min, max, referenceY, color]);

  const label =
    ariaLabel ??
    (data.length === 0 ? "Sin datos" : `Sparkline: ${data.map((v) => `${v}`).join(", ")}`);

  if (data.length === 0) {
    return <span className="text-[10px] font-mono text-slate-300 select-none">—</span>;
  }

  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ overflow: "visible" }}
      role="img"
      aria-label={label}
    >
      {/* Línea de referencia */}
      {refLineY !== null && (
        <line
          x1={0}
          y1={refLineY}
          x2={width}
          y2={refLineY}
          stroke="#CBD5E1"
          strokeWidth={1}
          strokeDasharray="2 2"
          aria-hidden
        />
      )}

      {/* Polilínea */}
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
