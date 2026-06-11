"use client";

import { useCallback, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCcw,
  Send,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import type { RolUsuario } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAsignacion } from "@/hooks/useAsignacion";
import { useSucursalActiva } from "@/contexts/sucursal-context";
import { PoolTecnicos, TarjetaTecnicoOverlay } from "@/components/asignacion/pool-tecnicos";
import { ChipAsignadoOverlay } from "@/components/asignacion/of-drop-card";
import {
  GridOrdenesAsignacion,
  UNASSIGN_ZONE_ID,
} from "@/components/asignacion/grid-ordenes-asignacion";
import dynamic from "next/dynamic";
import type { TecnicoConCarga } from "@/types/asignacion";

// GanttDiario computes pixel-perfect timeline blocks for every technician
// assignment — deferred until the page has rendered the interactive DnD board.
const GanttDiario = dynamic(
  () => import("@/components/asignacion/gantt-diario").then((m) => m.GanttDiario),
  {
    loading: () => <Skeleton className="h-[220px] w-full rounded-xl" />,
    ssr: false,
  }
);

// ── Types ──────────────────────────────────────────────────────────────────

type DragInfo =
  | { type: "tecnico"; id: string; tecnico: TecnicoConCarga }
  | {
      type: "tecnico_asignado";
      id: string;
      tecnicoId: string;
      ordenTrabajoId: string;
      nombre: string;
      apellido: string;
      iniciales: string;
      color: string;
    }
  | null;

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  rol: RolUsuario;
  sucursalActivaId: string;
  sucursalActivaNombre: string;
}

// ── KPI Card ───────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  valor,
  sub,
  tone,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  valor: React.ReactNode;
  sub: string;
  tone: "neutral" | "good" | "warn" | "danger";
  loading?: boolean;
}) {
  const toneClasses = {
    neutral: "border-slate-200",
    good: "border-emerald-200 bg-emerald-50/40",
    warn: "border-yellow-200 bg-yellow-50/40",
    danger: "border-red-200 bg-red-50/40",
  };
  const toneText = {
    neutral: "text-slate-700",
    good: "text-emerald-700",
    warn: "text-yellow-700",
    danger: "text-red-700",
  };
  const toneIcon = {
    neutral: "text-slate-400",
    good: "text-emerald-500",
    warn: "text-yellow-500",
    danger: "text-red-500",
  };

  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", toneClasses[tone])}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", toneIcon[tone])} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-16" />
        ) : (
          <p className={cn("text-xl font-bold", toneText[tone])}>{valor}</p>
        )}
        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  );
}

// ── Page client ────────────────────────────────────────────────────────────

export function AsignacionPageClient({
  sucursalActivaId: _initialId,
  sucursalActivaNombre: _initialNombre,
}: Props) {
  const { sucursalActivaId, sucursalActiva } = useSucursalActiva();
  const sucursalActivaNombre = sucursalActiva.nombre;
  const {
    tecnicos,
    ordenes,
    resumen,
    loading,
    mutating,
    isDirty,
    asignar,
    desasignar,
    mover,
    resetChanges,
    publicarPlan,
  } = useAsignacion(sucursalActivaId);

  const [activeDrag, setActiveDrag] = useState<DragInfo>(null);
  const [publishingPlan, setPublishingPlan] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handleDragCancel = useCallback((_: DragCancelEvent) => {
    setActiveDrag(null);
  }, []);

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      const d = active.data.current as Record<string, unknown> | undefined;
      if (!d) return;

      if (d.type === "tecnico") {
        const tec = tecnicos.find((t) => t.id === active.id);
        if (tec) setActiveDrag({ type: "tecnico", id: active.id as string, tecnico: tec });
      } else if (d.type === "tecnico_asignado") {
        setActiveDrag({
          type: "tecnico_asignado",
          id: active.id as string,
          tecnicoId: d.tecnicoId as string,
          ordenTrabajoId: d.ordenTrabajoId as string,
          nombre: d.nombre as string,
          apellido: d.apellido as string,
          iniciales: d.iniciales as string,
          color: d.color as string,
        });
      }
    },
    [tecnicos]
  );

  const handleDragEnd = useCallback(
    async ({ over }: DragEndEvent) => {
      const current = activeDrag;
      setActiveDrag(null);
      if (!current || !over) return;

      const overType = (over.data.current as Record<string, unknown> | undefined)?.type as
        | string
        | undefined;

      if (current.type === "tecnico") {
        if (overType === "of_slot") {
          const tecnicoId = current.id;
          const ordenTrabajoId = over.id as string;
          const result = await asignar(tecnicoId, ordenTrabajoId);
          if (result.ok) {
            const of = ordenes.find((o) => o.id === ordenTrabajoId);
            toast.success(`${current.tecnico.nombre} asignado a ${of?.numero ?? "OF"}`);
            for (const w of result.warnings) toast.warning(w.mensaje);
          } else {
            toast.error(result.error ?? "Error al asignar");
          }
        }
        // dropping pool tecnico on unassign zone → no-op
      } else if (current.type === "tecnico_asignado") {
        const { tecnicoId, ordenTrabajoId: desdeOrdenId, nombre } = current;

        if (overType === "of_slot") {
          const haciaOrdenId = over.id as string;
          if (haciaOrdenId === desdeOrdenId) return; // same OF, no-op
          const result = await mover(tecnicoId, desdeOrdenId, haciaOrdenId);
          if (result.ok) {
            const of = ordenes.find((o) => o.id === haciaOrdenId);
            toast.success(`${nombre} movido a ${of?.numero ?? "OF"}`);
          } else {
            toast.error(result.error ?? "Error al mover");
          }
        } else if (over.id === UNASSIGN_ZONE_ID) {
          const result = await desasignar(tecnicoId, desdeOrdenId);
          if (result.ok) {
            const of = ordenes.find((o) => o.id === desdeOrdenId);
            toast.success(`${nombre} devuelto al pool (OF ${of?.numero ?? ""})`);
            for (const w of result.warnings) toast.warning(w.mensaje);
          } else {
            toast.error(result.error ?? "Error al desasignar");
          }
        }
      }
    },
    [activeDrag, asignar, mover, desasignar, ordenes]
  );

  // ── Publicar plan ─────────────────────────────────────────────────────────

  async function handlePublicarPlan() {
    setPublishingPlan(true);
    const result = await publicarPlan();
    setPublishingPlan(false);
    if (result.ok && result.resumen) {
      const r = result.resumen;
      toast.success(
        `Plan publicado · ${r.tecnicos} técnicos · ${r.ordenes} OFs · ${r.hhTotal}h` +
          (r.conflictos > 0 ? ` · ${r.conflictos} conflicto${r.conflictos !== 1 ? "s" : ""}` : "")
      );
    } else {
      toast.error(result.error ?? "Error al publicar el plan");
    }
  }

  // ── KPI tones ─────────────────────────────────────────────────────────────

  const utilizacionTone =
    resumen.utilizacion >= 75 ? "good" : resumen.utilizacion >= 50 ? "warn" : "neutral";
  const ofSinTone = resumen.ofSinAsignar > 0 ? "warn" : "good";
  const sobreTone = resumen.sobreCapacidad > 0 ? "danger" : "good";
  const tecnicosTone =
    resumen.tecnicosAsignados === 0
      ? "neutral"
      : resumen.tecnicosAsignados === resumen.totalTecnicos
        ? "good"
        : "warn";

  const isActiveDrag = activeDrag !== null;
  const activeDragTecnicoId =
    activeDrag?.type === "tecnico"
      ? activeDrag.id
      : activeDrag?.type === "tecnico_asignado"
        ? activeDrag.tecnicoId
        : null;
  const activeDragOrigenId =
    activeDrag?.type === "tecnico_asignado" ? activeDrag.ordenTrabajoId : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Asignación del día</h1>
            <p className="text-sm text-slate-500">
              Sucursal {sucursalActivaNombre} · arrastra técnicos a una OF para asignar · al
              sobre-asignar te avisamos en vivo
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={resetChanges}
              disabled={!isDirty || mutating || loading}
            >
              <RefreshCcw className="size-4" />
              Deshacer cambios
            </Button>
            <Button
              size="sm"
              onClick={handlePublicarPlan}
              disabled={publishingPlan || mutating || loading}
            >
              {publishingPlan ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              Publicar plan
            </Button>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard
            icon={Users}
            label="Técnicos asignados"
            valor={`${resumen.tecnicosAsignados}/${resumen.totalTecnicos}`}
            sub={`${resumen.totalTecnicos - resumen.tecnicosAsignados} sin carga`}
            tone={tecnicosTone}
            loading={loading}
          />
          <KpiCard
            icon={Clock}
            label="HH planificadas"
            valor={`${resumen.hhPlanificadas.toFixed(1)}h`}
            sub={`de ${resumen.hhDisponibles}h disponibles`}
            tone="neutral"
            loading={loading}
          />
          <KpiCard
            icon={Zap}
            label="Utilización"
            valor={`${resumen.utilizacion}%`}
            sub="meta turno 75%"
            tone={utilizacionTone}
            loading={loading}
          />
          <KpiCard
            icon={AlertTriangle}
            label="OF sin asignar"
            valor={resumen.ofSinAsignar}
            sub={
              resumen.ofSinAsignar === 0 ? "todas completas" : `de ${resumen.totalOrdenes} activas`
            }
            tone={ofSinTone}
            loading={loading}
          />
          <KpiCard
            icon={CheckCircle2}
            label="Sobre capacidad"
            valor={resumen.sobreCapacidad}
            sub={
              resumen.sobreCapacidad === 0
                ? "ningún técnico sobrecargado"
                : `técnico${resumen.sobreCapacidad !== 1 ? "s" : ""} con >8h`
            }
            tone={sobreTone}
            loading={loading}
          />
        </div>

        {/* ── Layout 2 columnas ── */}
        <div className="flex gap-5 items-start">
          {/* Columna izquierda — Pool técnicos */}
          <div className="w-[340px] shrink-0">
            <PoolTecnicos
              tecnicos={tecnicos}
              loading={loading}
              activeDragId={isActiveDrag ? (activeDragTecnicoId ?? null) : null}
            />
          </div>

          {/* Columna derecha — Grid OF + Gantt */}
          <div className="flex-1 min-w-0 space-y-6">
            <GridOrdenesAsignacion
              ordenes={ordenes}
              loading={loading}
              isActiveDrag={isActiveDrag}
              activeDragTecnicoId={activeDragTecnicoId}
              activeDragOrigenId={activeDragOrigenId}
              onDesasignar={async (tecnicoId, ordenTrabajoId) => {
                const result = await desasignar(tecnicoId, ordenTrabajoId);
                const of = ordenes.find((o) => o.id === ordenTrabajoId);
                if (result.ok) {
                  const tec = tecnicos.find((t) => t.id === tecnicoId);
                  toast.success(`${tec?.nombre ?? "Técnico"} quitado de ${of?.numero ?? "OF"}`);
                  for (const w of result.warnings) toast.warning(w.mensaje);
                } else {
                  toast.error(result.error ?? "Error al desasignar");
                }
              }}
            />

            {/* Gantt diario */}
            <GanttDiario tecnicos={tecnicos} ordenes={ordenes} />
          </div>
        </div>
      </div>

      {/* ── DragOverlay: 1.02x scale + pronounced shadow ── */}
      <DragOverlay
        dropAnimation={{
          duration: 180,
          easing: "cubic-bezier(0.18,0.67,0.6,1.22)",
        }}
        style={{ cursor: "grabbing" }}
      >
        {activeDrag?.type === "tecnico" && (
          <div style={{ transform: "scale(1.02)", transformOrigin: "top left" }}>
            <TarjetaTecnicoOverlay tecnico={activeDrag.tecnico} />
          </div>
        )}
        {activeDrag?.type === "tecnico_asignado" && (
          <div style={{ transform: "scale(1.05)", transformOrigin: "center" }}>
            <ChipAsignadoOverlay
              nombre={activeDrag.nombre}
              iniciales={activeDrag.iniciales}
              color={activeDrag.color}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
