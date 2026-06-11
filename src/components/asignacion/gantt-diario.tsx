"use client";

import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OFAsignable, OFAsignadaResumen, TecnicoConCarga } from "@/types/asignacion";

// ── Constants ──────────────────────────────────────────────────────────────

const GANTT_START_H = 7; // 07:00
const GANTT_END_H = 18; // 18:00
const GANTT_TOTAL_MIN = (GANTT_END_H - GANTT_START_H) * 60; // 660 min
const WORK_START_MIN = 8 * 60; // 08:00 → 480
const LUNCH_START_MIN = 13 * 60; // 13:00 → 780
const LUNCH_DUR_MIN = 45;
const GANTT_END_MIN = GANTT_END_H * 60; // 1080
const LABEL_W = 120; // px, left column for name
const ROW_H = 36; // px

// ── Color logic ────────────────────────────────────────────────────────────

const OF_KEYWORD_COLORS: Array<{ keywords: string[]; color: string; label: string }> = [
  { keywords: ["mantenci", "manteni", "mantenimiento"], color: "#3B82F6", label: "Mantención" },
  { keywords: ["reparaci", "repair", "repar"], color: "#1D4ED8", label: "Reparación" },
  { keywords: ["diagnóst", "diagnost", "diagnos"], color: "#1E3A5F", label: "Diagnóstico" },
  { keywords: ["garantí", "garanti", "garantia"], color: "#F97316", label: "Garantía" },
];

const FALLBACK_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#22C55E",
  "#0EA5E9",
  "#A855F7",
];

function getOfColor(nombre: string, numero: string): string {
  const lower = nombre.toLowerCase();
  for (const { keywords, color } of OF_KEYWORD_COLORS) {
    if (keywords.some((k) => lower.includes(k))) return color;
  }
  // Deterministic fallback based on OF number characters
  let hash = 0;
  for (let i = 0; i < numero.length; i++) {
    hash = (hash * 31 + numero.charCodeAt(i)) % FALLBACK_COLORS.length;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

// ── Gantt data types ───────────────────────────────────────────────────────

interface GanttBlock {
  startMin: number; // absolute minutes from midnight
  durationMin: number;
  ofNumero: string;
  ofNombre: string;
  color: string;
  isLunch: boolean;
}

interface GanttRow {
  tecnicoId: string;
  nombre: string;
  apellido: string;
  iniciales: string;
  color: string;
  blocks: GanttBlock[];
}

// ── Block computation ──────────────────────────────────────────────────────

function buildLunchBlock(startMin: number): GanttBlock {
  return {
    startMin,
    durationMin: LUNCH_DUR_MIN,
    ofNumero: "Almuerzo",
    ofNombre: "Almuerzo",
    color: "#EAB308",
    isLunch: true,
  };
}

function computeBlocks(
  assignments: OFAsignadaResumen[],
  ofMap: Map<string, OFAsignable>
): GanttBlock[] {
  if (assignments.length === 0) return [];

  let currentMin = WORK_START_MIN;
  const blocks: GanttBlock[] = [];
  let lunchInserted = false;

  for (const a of assignments) {
    const ofData = ofMap.get(a.ofId);
    const ofNombre = ofData?.nombre ?? a.ofNombre;
    const color = getOfColor(ofNombre, a.ofNumero);
    const durMin = Math.max(1, Math.round(a.hhPlanificadas * 60));

    // ── Lunch insertion logic ──────────────────────────────────────────────
    if (!lunchInserted) {
      if (currentMin < LUNCH_START_MIN && currentMin + durMin > LUNCH_START_MIN) {
        // Block spans 13:00 → split it
        const beforeDur = LUNCH_START_MIN - currentMin;
        const afterDur = durMin - beforeDur;

        if (beforeDur > 0) {
          blocks.push({
            startMin: currentMin,
            durationMin: beforeDur,
            ofNumero: a.ofNumero,
            ofNombre,
            color,
            isLunch: false,
          });
        }
        blocks.push(buildLunchBlock(LUNCH_START_MIN));
        lunchInserted = true;

        const afterStart = LUNCH_START_MIN + LUNCH_DUR_MIN;
        if (afterDur > 0) {
          const clipped = Math.min(afterDur, GANTT_END_MIN - afterStart);
          if (clipped > 0)
            blocks.push({
              startMin: afterStart,
              durationMin: clipped,
              ofNumero: a.ofNumero,
              ofNombre,
              color,
              isLunch: false,
            });
          currentMin = afterStart + afterDur;
        } else {
          currentMin = afterStart;
        }
        continue;
      }

      if (currentMin >= LUNCH_START_MIN && blocks.length > 0) {
        // Past 13:00 but haven't inserted lunch yet
        const lunchStart = Math.max(LUNCH_START_MIN, currentMin);
        blocks.push(buildLunchBlock(lunchStart));
        lunchInserted = true;
        currentMin = Math.max(currentMin, lunchStart + LUNCH_DUR_MIN);
      }
    }

    // ── Regular block ──────────────────────────────────────────────────────
    const startClamped = Math.min(currentMin, GANTT_END_MIN);
    const endClamped = Math.min(currentMin + durMin, GANTT_END_MIN);
    const finalDur = endClamped - startClamped;

    if (finalDur > 0) {
      blocks.push({
        startMin: startClamped,
        durationMin: finalDur,
        ofNumero: a.ofNumero,
        ofNombre,
        color,
        isLunch: false,
      });
    }
    currentMin += durMin;
  }

  return blocks;
}

function computeGanttRows(tecnicos: TecnicoConCarga[], ordenes: OFAsignable[]): GanttRow[] {
  const ofMap = new Map(ordenes.map((o) => [o.id, o]));

  return tecnicos
    .filter((t) => t.ofAsignadas.length > 0)
    .map((t) => ({
      tecnicoId: t.id,
      nombre: t.nombre,
      apellido: t.apellido,
      iniciales: t.iniciales,
      color: t.color,
      blocks: computeBlocks(t.ofAsignadas, ofMap),
    }));
}

// ── Helpers ────────────────────────────────────────────────────────────────

function minToPercent(minutes: number): string {
  const offsetFromStart = minutes - GANTT_START_H * 60;
  return `${Math.max(0, (offsetFromStart / GANTT_TOTAL_MIN) * 100).toFixed(3)}%`;
}

function durToPercent(minutes: number): string {
  return `${Math.max(0, (minutes / GANTT_TOTAL_MIN) * 100).toFixed(3)}%`;
}

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ── Leyenda ────────────────────────────────────────────────────────────────

const LEYENDA = [
  ...OF_KEYWORD_COLORS.map((k) => ({ label: k.label, color: k.color })),
  { label: "Almuerzo", color: "#EAB308" },
];

// ── Componente principal ───────────────────────────────────────────────────

interface GanttDiarioProps {
  tecnicos: TecnicoConCarga[];
  ordenes: OFAsignable[];
}

export function GanttDiario({ tecnicos, ordenes }: GanttDiarioProps) {
  const rows = useMemo(() => computeGanttRows(tecnicos, ordenes), [tecnicos, ordenes]);

  const hours = Array.from(
    { length: GANTT_END_H - GANTT_START_H + 1 },
    (_, i) => GANTT_START_H + i
  );

  return (
    <TooltipProvider>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Vista del turno · <span className="font-normal text-slate-500">gantt</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Vista previa del turno con la asignación actual
            </p>
          </div>
          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {LEYENDA.map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                <span className="text-[11px] text-slate-500 whitespace-nowrap">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {rows.length === 0 && (
          <div className="flex items-center justify-center py-12 text-center">
            <p className="text-sm text-slate-400">
              Sin asignaciones aún · arrastra técnicos a las OF para verlo aquí.
            </p>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 640 }}>
              {/* Time axis */}
              <div
                className="flex items-end pb-1 border-b border-slate-100"
                style={{ paddingLeft: LABEL_W }}
              >
                <div className="relative flex-1" style={{ height: 20 }}>
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="absolute text-[10px] font-mono text-slate-400 -translate-x-1/2"
                      style={{ left: minToPercent(h * 60) }}
                    >
                      {String(h).padStart(2, "0")}h
                    </span>
                  ))}
                </div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-50">
                {rows.map((row) => (
                  <div key={row.tecnicoId} className="flex items-center" style={{ height: ROW_H }}>
                    {/* Name label */}
                    <div
                      className="flex items-center gap-2 shrink-0 px-3"
                      style={{ width: LABEL_W }}
                    >
                      <span
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-white text-[9px] font-bold"
                        style={{ backgroundColor: row.color }}
                      >
                        {row.iniciales}
                      </span>
                      <span className="text-xs text-slate-700 truncate">
                        {row.nombre.split(" ")[0]} {row.apellido.charAt(0)}.
                      </span>
                    </div>

                    {/* Timeline */}
                    <div className="relative flex-1 h-full">
                      {/* Hour grid lines */}
                      {hours.slice(1, -1).map((h) => (
                        <div
                          key={h}
                          className="absolute top-0 h-full w-px bg-slate-100"
                          style={{ left: minToPercent(h * 60) }}
                        />
                      ))}

                      {/* Work blocks */}
                      {row.blocks.map((b, i) => {
                        const showLabel = b.durationMin >= 30;
                        const label = b.isLunch ? "Almuerzo" : b.ofNumero;

                        return (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <div
                                className={cn(
                                  "absolute top-1 rounded-sm flex items-center justify-center overflow-hidden text-white text-[10px] font-semibold transition-opacity hover:opacity-90",
                                  b.isLunch ? "border border-yellow-400" : ""
                                )}
                                style={{
                                  left: minToPercent(b.startMin),
                                  width: durToPercent(b.durationMin),
                                  height: ROW_H - 8,
                                  backgroundColor: b.color,
                                }}
                              >
                                {showLabel && (
                                  <span className="truncate px-1 leading-none">{label}</span>
                                )}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {b.isLunch ? (
                                <span>Almuerzo · {LUNCH_DUR_MIN}min</span>
                              ) : (
                                <span>
                                  {b.ofNumero} · {b.ofNombre} · {formatHM(b.durationMin)}
                                </span>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom hour axis (subtle) */}
              <div
                className="flex items-start pt-0.5 border-t border-slate-100"
                style={{ paddingLeft: LABEL_W }}
              >
                <div className="relative flex-1" style={{ height: 14 }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute top-0 h-2 w-px bg-slate-200"
                      style={{ left: minToPercent(h * 60) }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
