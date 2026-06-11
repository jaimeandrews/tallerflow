"use client";

import { useMemo, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ArrowDownUp, Building2, CornerDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OFDropCard } from "./of-drop-card";
import type { OFAsignable } from "@/types/asignacion";

// ── Unassign drop zone ─────────────────────────────────────────────────────

export const UNASSIGN_ZONE_ID = "unassign_zone";

function UnassignZone({ isActiveDrag }: { isActiveDrag: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNASSIGN_ZONE_ID,
    data: { type: "unassign_zone" },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 gap-3 transition-all duration-150",
        isOver
          ? "border-red-400 bg-red-50 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]"
          : isActiveDrag
            ? "border-slate-300 bg-slate-50/60"
            : "border-slate-200 bg-slate-50/30 opacity-50"
      )}
    >
      <CornerDownLeft className={cn("size-8", isOver ? "text-red-500" : "text-slate-400")} />
      <div className="text-center">
        <p className={cn("text-sm font-semibold", isOver ? "text-red-600" : "text-slate-500")}>
          {isOver ? "Soltar para quitar asignación" : "Quitar asignación"}
        </p>
        <p className="text-xs text-slate-400 mt-0.5 max-w-[200px] text-center">
          Arrastra una ficha aquí para devolver el técnico al pool
        </p>
      </div>
    </div>
  );
}

// ── Sort helpers ───────────────────────────────────────────────────────────

type SortKey = "prioridad" | "sucursal" | "default";

const PRIORIDAD_ORDER: Record<string, number> = {
  CRITICA: 0,
  ALTA: 1,
  MEDIA: 2,
  BAJA: 3,
};

function sortOrdenes(ordenes: OFAsignable[], sort: SortKey): OFAsignable[] {
  if (sort === "prioridad") {
    return [...ordenes].sort(
      (a, b) => (PRIORIDAD_ORDER[a.prioridad] ?? 99) - (PRIORIDAD_ORDER[b.prioridad] ?? 99)
    );
  }
  if (sort === "sucursal") {
    return [...ordenes].sort((a, b) => a.sucursalNombre.localeCompare(b.sucursalNombre));
  }
  return ordenes;
}

// ── Grid skeleton ──────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div
      className="grid gap-[14px]"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 flex-1">
              <div className="flex gap-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-16" />
            <div className="flex gap-1">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="size-3.5 rounded-full" />
              ))}
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

// ── Grid principal ─────────────────────────────────────────────────────────

interface GridOrdenesAsignacionProps {
  ordenes: OFAsignable[];
  loading: boolean;
  isActiveDrag: boolean;
  activeDragTecnicoId: string | null;
  activeDragOrigenId: string | null;
  onDesasignar: (tecnicoId: string, ordenTrabajoId: string) => void;
}

export function GridOrdenesAsignacion({
  ordenes,
  loading,
  isActiveDrag,
  activeDragTecnicoId,
  activeDragOrigenId,
  onDesasignar,
}: GridOrdenesAsignacionProps) {
  const [sort, setSort] = useState<SortKey>("default");

  const ordenadas = useMemo(() => sortOrdenes(ordenes, sort), [ordenes, sort]);

  const sinStaffing = ordenes.filter((o) => o.slots.faltantes > 0).length;
  const total = ordenes.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-800">Órdenes a asignar</span>
          {sinStaffing > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-100 border border-red-300 px-2 py-0.5 text-xs font-semibold text-red-700">
              {sinStaffing} sin staffing
            </span>
          )}
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">
            {total} activa{total !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 hidden sm:inline">Ordenar:</span>
          <Button
            variant={sort === "prioridad" ? "default" : "outline"}
            size="xs"
            onClick={() => setSort((s) => (s === "prioridad" ? "default" : "prioridad"))}
          >
            <ArrowDownUp className="size-3" />
            Por prioridad
          </Button>
          <Button
            variant={sort === "sucursal" ? "default" : "outline"}
            size="xs"
            onClick={() => setSort((s) => (s === "sucursal" ? "default" : "sucursal"))}
          >
            <Building2 className="size-3" />
            Por sucursal
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <GridSkeleton />
      ) : ordenadas.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center gap-3 bg-slate-50/40">
          <p className="text-sm font-medium text-slate-600">No hay órdenes activas para asignar</p>
          <p className="text-xs text-slate-400">
            Todas las órdenes están finalizadas o no hay órdenes en esta sucursal
          </p>
        </div>
      ) : (
        <div
          className="grid gap-[14px]"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {ordenadas.map((of) => {
            // While dragging a pool technician, hide the card if they're already in it
            if (
              activeDragTecnicoId &&
              !activeDragOrigenId &&
              of.asignados.some((a) => a.usuario.id === activeDragTecnicoId)
            ) {
              return null;
            }
            // While dragging an assigned chip, hide the OF origin card as a drop target
            // (handled inside OFDropCard via isActiveDrag — card still shows but drop zone adjusts)
            return (
              <OFDropCard
                key={of.id}
                of={of}
                isActiveDrag={isActiveDrag}
                onDesasignar={onDesasignar}
              />
            );
          })}
        </div>
      )}

      {/* Unassign zone — only visible during active drag */}
      <UnassignZone isActiveDrag={isActiveDrag} />
    </div>
  );
}
