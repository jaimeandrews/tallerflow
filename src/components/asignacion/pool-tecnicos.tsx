"use client";

import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { FiltroTecnico, TecnicoConCarga } from "@/types/asignacion";

const ESTADO_BORDE: Record<string, string> = {
  TRABAJANDO: "ring-2 ring-emerald-500",
  PAUSA: "ring-2 ring-yellow-400",
  ALMUERZO: "ring-2 ring-blue-400",
  DETENIDO: "ring-2 ring-red-500",
  DISPONIBLE: "ring-1 ring-slate-300",
};

const HH_CAPACIDAD = 8;

// ── Card draggable ─────────────────────────────────────────────────────────

interface TarjetaTecnicoProps {
  tecnico: TecnicoConCarga;
  isDraggingActive: boolean;
}

function TarjetaTecnico({ tecnico, isDraggingActive }: TarjetaTecnicoProps) {
  const { setNodeRef, listeners, attributes, transform, isDragging } = useDraggable({
    id: tecnico.id,
    data: { type: "tecnico", tecnico },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const { hhAsignadas, porcentaje, sobreCarga } = tecnico.carga;
  const barColor = sobreCarga
    ? "bg-red-500"
    : porcentaje >= 80
      ? "bg-yellow-500"
      : "bg-emerald-500";

  const sinCarga = hhAsignadas === 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border p-3 select-none transition-all",
        isDragging
          ? "opacity-35 cursor-grabbing shadow-none"
          : "cursor-grab shadow-sm hover:shadow-md hover:border-slate-300 active:cursor-grabbing",
        sinCarga ? "border-slate-200 bg-slate-50/60" : "border-slate-200 bg-white",
        isDraggingActive && !isDragging && "border-blue-200 bg-blue-50/30"
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        <Avatar size="default" className="shrink-0">
          <AvatarFallback
            style={{ backgroundColor: tecnico.color }}
            className={cn("text-white text-xs font-bold", ESTADO_BORDE[tecnico.estadoActual])}
          >
            {tecnico.iniciales}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center justify-between gap-1">
            <p className="text-sm font-semibold text-slate-900 truncate">
              {tecnico.nombre} {tecnico.apellido}
            </p>
            {/* Drag handle */}
            <div
              {...listeners}
              {...attributes}
              className="shrink-0 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing transition-colors touch-none"
            >
              <GripVertical className="size-4" />
            </div>
          </div>

          {/* Especialidades */}
          {tecnico.especialidades.length > 0 && (
            <p className="text-[11px] text-slate-500 truncate">
              {tecnico.especialidades.join(" · ")}
            </p>
          )}

          {/* Carga */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className={cn(sobreCarga ? "text-red-600 font-semibold" : "text-slate-500")}>
                {hhAsignadas.toFixed(1)} / {HH_CAPACIDAD}h
              </span>
              <span
                className={cn(
                  "font-mono text-[10px]",
                  sobreCarga ? "text-red-600 font-semibold" : "text-slate-400"
                )}
              >
                {porcentaje}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full transition-all", barColor)}
                style={{ width: `${Math.min(100, porcentaje)}%` }}
              />
            </div>
          </div>

          {/* OF asignadas (mini list, max 2) */}
          {tecnico.ofAsignadas.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {tecnico.ofAsignadas.slice(0, 2).map((of) => (
                <span
                  key={of.ofId}
                  className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-600"
                >
                  {of.ofNumero}
                </span>
              ))}
              {tecnico.ofAsignadas.length > 2 && (
                <span className="text-[10px] text-slate-400">
                  +{tecnico.ofAsignadas.length - 2}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overlay card (shown while dragging) ───────────────────────────────────

export function TarjetaTecnicoOverlay({ tecnico }: { tecnico: TecnicoConCarga }) {
  const { hhAsignadas, porcentaje, sobreCarga } = tecnico.carga;
  const barColor = sobreCarga
    ? "bg-red-500"
    : porcentaje >= 80
      ? "bg-yellow-500"
      : "bg-emerald-500";

  return (
    <div className="rounded-lg border-2 border-blue-400 bg-white p-3 shadow-[0_12px_40px_rgba(0,0,0,0.20)] rotate-[1.5deg] w-[300px] pointer-events-none">
      <div className="flex items-center gap-2.5">
        <Avatar size="default" className="shrink-0">
          <AvatarFallback
            style={{ backgroundColor: tecnico.color }}
            className="text-white text-xs font-bold"
          >
            {tecnico.iniciales}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {tecnico.nombre} {tecnico.apellido}
          </p>
          {tecnico.especialidades.length > 0 && (
            <p className="text-[11px] text-slate-500 truncate">
              {tecnico.especialidades.join(" · ")}
            </p>
          )}
          <div className="space-y-0.5">
            <div className="flex justify-between text-[11px]">
              <span className={cn(sobreCarga ? "text-red-600 font-semibold" : "text-slate-500")}>
                {hhAsignadas.toFixed(1)} / {HH_CAPACIDAD}h
              </span>
              <span className="font-mono text-[10px] text-slate-400">{porcentaje}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", barColor)}
                style={{ width: `${Math.min(100, porcentaje)}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Pool (columna izquierda) ───────────────────────────────────────────────

interface PoolTecnicosProps {
  tecnicos: TecnicoConCarga[];
  loading: boolean;
  activeDragId: string | null;
}

export function PoolTecnicos({ tecnicos, loading, activeDragId }: PoolTecnicosProps) {
  const [filtro, setFiltro] = useState<FiltroTecnico>("todos");

  const filtrados = useMemo(() => {
    if (filtro === "disponibles") return tecnicos.filter((t) => t.carga.hhAsignadas < HH_CAPACIDAD);
    if (filtro === "ocupados") return tecnicos.filter((t) => t.carga.hhAsignadas > 0);
    return tecnicos;
  }, [tecnicos, filtro]);

  const isDraggingActive = activeDragId !== null;

  return (
    <div className="sticky top-20 flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden max-h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-800">Técnicos</span>
        </div>
        <span className="text-xs font-mono text-slate-500 bg-white border border-slate-200 rounded-full px-2 py-0.5">
          {filtrados.length}
          {filtro === "todos" ? `/${tecnicos.length}` : ""}
        </span>
      </div>

      {/* Filtro tabs */}
      <div className="px-3 py-2 border-b border-slate-100 shrink-0">
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as FiltroTecnico)}>
          <TabsList className="w-full">
            <TabsTrigger value="todos" className="flex-1 text-xs">
              Todos
            </TabsTrigger>
            <TabsTrigger value="disponibles" className="flex-1 text-xs">
              Disponibles
            </TabsTrigger>
            <TabsTrigger value="ocupados" className="flex-1 text-xs">
              Ocupados
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Lista scrollable */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {loading && (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-2.5 p-3 rounded-lg border border-slate-100">
                <Skeleton className="size-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-24" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && filtrados.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
            <Users className="size-8 text-slate-300" />
            <p className="text-xs text-slate-400">
              {filtro === "disponibles"
                ? "Todos los técnicos están asignados"
                : filtro === "ocupados"
                  ? "Ningún técnico tiene carga asignada"
                  : "Sin técnicos en esta sucursal"}
            </p>
          </div>
        )}

        {!loading &&
          filtrados.map((tecnico) => (
            <TarjetaTecnico
              key={tecnico.id}
              tecnico={tecnico}
              isDraggingActive={isDraggingActive}
            />
          ))}
      </div>

      {/* Footer hint */}
      <div className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 shrink-0">
        <GripVertical className="size-3.5 text-slate-400" />
        <span className="text-[11px] text-slate-400">arrastra para asignar · jornada de 8h</span>
      </div>
    </div>
  );
}
