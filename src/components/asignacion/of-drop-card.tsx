"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EstadoBadge, PrioridadBadge } from "@/components/ordenes/of-badges";
import type { OFAsignable } from "@/types/asignacion";

// ── Slot circles ───────────────────────────────────────────────────────────

const MAX_CIRCLES = 8;

function SlotCircles({ requeridos, asignados }: { requeridos: number; asignados: number }) {
  const show = Math.min(requeridos, MAX_CIRCLES);
  const extra = requeridos - MAX_CIRCLES;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Array.from({ length: show }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "size-3.5 rounded-full shrink-0 transition-colors",
            i < asignados ? "bg-emerald-500" : "border-[1.5px] border-dashed border-slate-400"
          )}
        />
      ))}
      {extra > 0 && <span className="text-[10px] font-mono text-slate-400">+{extra}</span>}
    </div>
  );
}

// ── Chip de técnico asignado (re-draggable) ────────────────────────────────

interface ChipAsignadoProps {
  asignacionId: string;
  tecnicoId: string;
  ordenTrabajoId: string;
  nombre: string;
  apellido: string;
  iniciales: string;
  color: string;
  hhPlanificadas: number;
  onDesasignar: () => void;
  isActiveDrag: boolean;
}

export function ChipAsignado({
  asignacionId,
  tecnicoId,
  ordenTrabajoId,
  nombre,
  apellido,
  iniciales,
  color,
  hhPlanificadas,
  onDesasignar,
  isActiveDrag,
}: ChipAsignadoProps) {
  const dragId = `chip_${asignacionId}`;

  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({
    id: dragId,
    data: {
      type: "tecnico_asignado",
      tecnicoId,
      ordenTrabajoId,
      nombre,
      apellido,
      iniciales,
      color,
    },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-all select-none",
        isDragging
          ? "opacity-35 cursor-grabbing"
          : "cursor-grab bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm active:cursor-grabbing",
        isActiveDrag && !isDragging && "border-blue-200 bg-blue-50/30"
      )}
    >
      {/* Drag handle */}
      <span
        {...listeners}
        {...attributes}
        className="text-slate-300 hover:text-slate-500 touch-none"
      >
        <GripVertical className="size-3" />
      </span>

      {/* Avatar mini */}
      <span
        className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-white font-bold text-[9px]"
        style={{ backgroundColor: color }}
      >
        {iniciales}
      </span>

      {/* Nombre */}
      <span className="text-slate-700 max-w-[80px] truncate">{nombre}</span>
      <span className="font-mono text-[10px] text-slate-400">{hhPlanificadas}h</span>

      {/* Quitar */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDesasignar();
        }}
        className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
        aria-label={`Quitar a ${nombre} ${apellido}`}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// ── Overlay para chip re-dragging ──────────────────────────────────────────

export function ChipAsignadoOverlay({
  nombre,
  iniciales,
  color,
}: {
  nombre: string;
  iniciales: string;
  color: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-400 bg-white px-2 py-1 shadow-xl text-xs rotate-3">
      <span
        className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full text-white font-bold text-[9px]"
        style={{ backgroundColor: color }}
      >
        {iniciales}
      </span>
      <span className="text-slate-700">{nombre}</span>
    </div>
  );
}

// ── Conflicto badge ────────────────────────────────────────────────────────

function ConflictoBadge({
  tipo,
  mensaje,
  nivel,
}: {
  tipo: string;
  mensaje: string;
  nivel: "error" | "warning";
}) {
  void tipo;
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-[11px]",
        nivel === "error" ? "text-red-600" : "text-amber-600"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full shrink-0",
          nivel === "error" ? "bg-red-500" : "bg-amber-400"
        )}
      />
      {mensaje}
    </div>
  );
}

// ── OF Drop Card ───────────────────────────────────────────────────────────

interface OFDropCardProps {
  of: OFAsignable;
  isActiveDrag: boolean;
  onDesasignar: (tecnicoId: string, ordenTrabajoId: string) => void;
}

export function OFDropCard({ of, isActiveDrag, onDesasignar }: OFDropCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: of.id,
    data: { type: "of_slot", of },
  });

  const { requeridos, asignados, faltantes } = of.slots;
  const completa = faltantes === 0;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-xl border transition-all duration-150",
        isOver
          ? "border-blue-400 bg-blue-50 shadow-[0_0_0_3px_rgba(59,130,246,0.25)]"
          : completa
            ? "border-emerald-200 bg-white"
            : isActiveDrag
              ? "border-blue-200 border-dashed bg-blue-50/20"
              : "border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-slate-300"
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-mono text-sm font-bold text-blue-600">{of.numero}</span>
              <PrioridadBadge prioridad={of.prioridad} className="text-[10px] px-1.5" />
              {of.critica && (
                <span className="inline-flex items-center gap-0.5 rounded-full border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                  <AlertTriangle className="size-2.5" />
                  Crítica
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-slate-900 truncate">{of.nombre}</p>
            <p className="text-[11px] text-slate-500 truncate">
              {of.cliente} · {of.equipo}
            </p>
          </div>

          {/* Estado + HH */}
          <div className="shrink-0 text-right space-y-1">
            <EstadoBadge estado={of.estado} />
            <p className="text-[10px] font-mono text-slate-400">
              {of.hhConsumidas.toFixed(1)}h / {of.hhEstimadas.toFixed(1)}h
            </p>
          </div>
        </div>

        {/* Slots */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Técnicos</span>
            <span
              className={cn(
                "text-xs font-semibold",
                completa ? "text-emerald-600" : faltantes > 0 ? "text-amber-600" : "text-slate-700"
              )}
            >
              {asignados}/{requeridos}
            </span>
          </div>
          <SlotCircles requeridos={requeridos} asignados={asignados} />
        </div>

        {/* Chips técnicos asignados */}
        {of.asignados.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {of.asignados.map((a) => (
              <ChipAsignado
                key={a.asignacionId}
                asignacionId={a.asignacionId}
                tecnicoId={a.usuario.id}
                ordenTrabajoId={of.id}
                nombre={a.usuario.nombre}
                apellido={a.usuario.apellido}
                iniciales={a.usuario.iniciales}
                color={a.usuario.color}
                hhPlanificadas={a.hhPlanificadas}
                onDesasignar={() => onDesasignar(a.usuario.id, of.id)}
                isActiveDrag={isActiveDrag}
              />
            ))}
          </div>
        )}

        {/* Drop zone */}
        {isOver ? (
          <div className="rounded-lg border-2 border-blue-400 bg-blue-50 py-2.5 text-center">
            <p className="text-xs font-semibold text-blue-600">↓ Soltar para asignar</p>
          </div>
        ) : isActiveDrag && !completa ? (
          <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/50 py-2.5 text-center">
            <span className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <GripVertical className="size-3" />
              arrastra técnico aquí
            </span>
          </div>
        ) : completa ? null : (
          <div className="rounded-lg border border-dashed border-slate-200 py-2 text-center">
            <span className="text-[11px] text-slate-400">
              {faltantes} slot{faltantes !== 1 ? "s" : ""} libre{faltantes !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

      {/* Conflictos */}
      {of.conflictos.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2 space-y-1">
          {of.conflictos.map((c, i) => (
            <ConflictoBadge key={i} tipo={c.tipo} mensaje={c.mensaje} nivel={c.nivel} />
          ))}
        </div>
      )}
    </div>
  );
}
