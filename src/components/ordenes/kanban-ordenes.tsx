"use client";

import { useCallback, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { EstadoOF } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/formatters";
import { ESTADO_OF_DOT_COLORS, ESTADO_OF_LABELS, ESTADO_OF_ORDER } from "@/lib/utils/constants";
import { PrioridadBadge } from "./of-badges";
import { OFAsignados } from "./of-asignados";
import type { OrdenTrabajoListItem } from "@/types/ordenes";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface KanbanOrdenesProps {
  ordenes: OrdenTrabajoListItem[];
  loading: boolean;
  onEstadoChange?: (id: string, nuevoEstado: EstadoOF) => void;
}

// ── Transiciones válidas (mirror del backend) ──────────────────────────────

const TRANSICIONES: Record<EstadoOF, EstadoOF[]> = {
  PENDIENTE: ["EN_PROCESO", "PAUSADA"],
  EN_PROCESO: ["PAUSADA", "ESPERA_REPUESTO", "FINALIZADA"],
  PAUSADA: ["EN_PROCESO"],
  ESPERA_REPUESTO: ["EN_PROCESO", "PAUSADA"],
  FINALIZADA: [],
};

function transicionPermitida(desde: EstadoOF, hasta: EstadoOF): boolean {
  if (desde === hasta) return false;
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

// ── Card draggable ─────────────────────────────────────────────────────────

function OFCard({
  of,
  isDragging,
  isOverlay,
}: {
  of: OrdenTrabajoListItem;
  isDragging?: boolean;
  isOverlay?: boolean;
}) {
  const pct = of.hhEstimadas > 0 ? (of.hhConsumidas / of.hhEstimadas) * 100 : 0;
  const barColor = pct > 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-500" : "bg-emerald-500";
  const slaVencido =
    of.slaVencimiento && of.estado !== "FINALIZADA" && new Date(of.slaVencimiento) < new Date();

  return (
    <div
      className={cn(
        "rounded-md bg-white border p-3 flex flex-col gap-2.5 select-none",
        isOverlay
          ? "shadow-2xl border-blue-400 rotate-[1.5deg] scale-[1.02] opacity-95"
          : isDragging
            ? "opacity-40 border-dashed border-slate-300"
            : of.critica && of.estado !== "FINALIZADA"
              ? "border-red-300 shadow-sm"
              : "border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-shadow"
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-1.5">
        <span className="font-mono text-xs font-bold text-blue-600 truncate">{of.numero}</span>
        <PrioridadBadge prioridad={of.prioridad} className="text-[10px] px-1.5 shrink-0" />
      </div>

      {/* Nombre */}
      <p className="text-sm font-semibold text-slate-900 leading-snug line-clamp-2">{of.nombre}</p>

      {/* Cliente / equipo */}
      <div className="text-[11px] text-slate-500 space-y-0.5">
        <p className="truncate">{of.cliente}</p>
        <p className="truncate">{of.equipo}</p>
      </div>

      {/* Barra HH */}
      <div className="space-y-1">
        <div className="h-1.5 w-full rounded-full bg-slate-100">
          <div
            className={cn("h-full rounded-full", barColor)}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <span
          className={cn(
            "text-[11px] font-mono",
            pct > 100 ? "text-red-600 font-semibold" : "text-slate-500"
          )}
        >
          {of.hhConsumidas.toFixed(1)} / {of.hhEstimadas.toFixed(1)} h
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-slate-100">
        <OFAsignados
          asignaciones={of.asignaciones}
          tecnicosRequeridos={of.tecnicosRequeridos}
          max={3}
        />
        <div className="flex items-center gap-1 shrink-0">
          {of.critica && of.estado !== "FINALIZADA" && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">
              <AlertTriangle className="size-2.5" />
              Crítica
            </span>
          )}
          {of.slaVencimiento && (
            <span
              className={cn(
                "text-[10px] font-mono",
                slaVencido ? "text-red-600 font-semibold" : "text-slate-400"
              )}
            >
              {formatDate(of.slaVencimiento)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Item draggable wrapper ─────────────────────────────────────────────────

function DraggableCard({ of }: { of: OrdenTrabajoListItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: of.id,
    data: { of },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <OFCard of={of} isDragging={isDragging} />
    </div>
  );
}

// ── Columna droppable ─────────────────────────────────────────────────────

function KanbanColumn({
  estado,
  ordenes,
  loading,
  isOver,
  isInvalidDrop,
}: {
  estado: EstadoOF;
  ordenes: OrdenTrabajoListItem[];
  loading: boolean;
  isOver: boolean;
  isInvalidDrop: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: estado });

  return (
    <div
      className={cn(
        "min-w-[272px] w-[272px] flex-shrink-0 flex flex-col rounded-xl border transition-colors",
        isOver && !isInvalidDrop
          ? "border-blue-400 bg-blue-50/60 shadow-md shadow-blue-100"
          : isOver && isInvalidDrop
            ? "border-red-400 bg-red-50/50"
            : "border-slate-200 bg-slate-50"
      )}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-slate-200/80">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "size-2 rounded-full",
              isOver && !isInvalidDrop ? "bg-blue-500" : ESTADO_OF_DOT_COLORS[estado]
            )}
          />
          <span className="text-sm font-semibold text-slate-800">{ESTADO_OF_LABELS[estado]}</span>
        </div>
        <span className="text-[11px] font-mono text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">
          {ordenes.length}
        </span>
      </div>

      {/* Drop zone hint */}
      {isOver && (
        <div
          className={cn(
            "mx-2 mt-2 rounded-md border-2 border-dashed py-2 text-center text-xs font-medium",
            isInvalidDrop
              ? "border-red-300 bg-red-50 text-red-500"
              : "border-blue-300 bg-blue-50 text-blue-500"
          )}
        >
          {isInvalidDrop ? "Transición no permitida" : `Mover a ${ESTADO_OF_LABELS[estado]}`}
        </div>
      )}

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto max-h-[calc(100vh-380px)] min-h-[120px]"
      >
        {loading && ordenes.length === 0 && (
          <p className="text-center text-xs text-slate-400 py-6">Cargando…</p>
        )}
        {!loading && ordenes.length === 0 && !isOver && (
          <p className="text-center text-xs text-slate-400 py-6 italic">Sin OFs</p>
        )}
        {ordenes.map((of) => (
          <DraggableCard key={of.id} of={of} />
        ))}
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function KanbanOrdenes({ ordenes, loading, onEstadoChange }: KanbanOrdenesProps) {
  const [localOrdenes, setLocalOrdenes] = useState<OrdenTrabajoListItem[]>(ordenes);
  const [activeOf, setActiveOf] = useState<OrdenTrabajoListItem | null>(null);
  const [overColumn, setOverColumn] = useState<EstadoOF | null>(null);

  // Keep local copy in sync when parent data changes (on refetch)
  const [prevOrdenes, setPrevOrdenes] = useState(ordenes);
  if (ordenes !== prevOrdenes) {
    setPrevOrdenes(ordenes);
    setLocalOrdenes(ordenes);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const porEstado = useMemo(() => {
    const map = {} as Record<EstadoOF, OrdenTrabajoListItem[]>;
    for (const e of ESTADO_OF_ORDER) map[e] = [];
    for (const of of localOrdenes) map[of.estado].push(of);
    return map;
  }, [localOrdenes]);

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      const of = localOrdenes.find((o) => o.id === active.id);
      setActiveOf(of ?? null);
    },
    [localOrdenes]
  );

  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    setOverColumn(over ? (over.id as EstadoOF) : null);
  }, []);

  const handleDragEnd = useCallback(
    async ({ active, over }: DragEndEvent) => {
      setActiveOf(null);
      setOverColumn(null);

      if (!over) return;

      const targetEstado = over.id as EstadoOF;
      const of = localOrdenes.find((o) => o.id === active.id);
      if (!of || of.estado === targetEstado) return;

      if (!transicionPermitida(of.estado, targetEstado)) {
        toast.error(
          `No se puede pasar de "${ESTADO_OF_LABELS[of.estado]}" a "${ESTADO_OF_LABELS[targetEstado]}"`
        );
        return;
      }

      // Optimistic update
      setLocalOrdenes((prev) =>
        prev.map((o) => (o.id === of.id ? { ...o, estado: targetEstado } : o))
      );

      try {
        const res = await fetch(`/api/ordenes/${of.id}/estado`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: targetEstado }),
        });

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Error ${res.status}`);
        }

        toast.success(`${of.numero} → ${ESTADO_OF_LABELS[targetEstado]}`);
        onEstadoChange?.(of.id, targetEstado);
      } catch (err) {
        // Revert
        setLocalOrdenes((prev) =>
          prev.map((o) => (o.id === of.id ? { ...o, estado: of.estado } : o))
        );
        toast.error(err instanceof Error ? err.message : "Error al cambiar estado");
      }
    },
    [localOrdenes, onEstadoChange]
  );

  const isInvalidDrop =
    overColumn !== null && activeOf !== null && !transicionPermitida(activeOf.estado, overColumn);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
        {ESTADO_OF_ORDER.map((estado) => (
          <KanbanColumn
            key={estado}
            estado={estado}
            ordenes={porEstado[estado]}
            loading={loading}
            isOver={overColumn === estado}
            isInvalidDrop={overColumn === estado && isInvalidDrop}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18,0.67,0.6,1.22)" }}>
        {activeOf && <OFCard of={activeOf} isOverlay />}
      </DragOverlay>
    </DndContext>
  );
}
