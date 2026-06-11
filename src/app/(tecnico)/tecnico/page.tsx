"use client";

import { useState, useEffect } from "react";
import { Pause, Play, CheckCircle, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TimerDisplay } from "@/components/marcaje/TimerDisplay";
import { EstadoPill, getEstadoColor } from "@/components/marcaje/EstadoPill";
import { ActividadGrid, type ActividadItem } from "@/components/marcaje/ActividadGrid";
import { MarcajeTimeline } from "@/components/marcaje/MarcajeTimeline";
import { OFCard } from "@/components/marcaje/OFCard";
import { useMarcajeActivo } from "@/hooks/useMarcajeActivo";
import { useHistorialHoy } from "@/hooks/useHistorialHoy";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { MarcajeActivo } from "@/types/marcaje";

function getEstado(m: MarcajeActivo | null): string {
  if (!m) return "DISPONIBLE";
  if (m.tipo === "PAUSA") return "PAUSA";
  if (m.actividad.nombre === "Almuerzo") return "ALMUERZO";
  if (m.actividad.nombre === "Espera repuesto") return "DETENIDO";
  if (m.actividad.productiva) return "TRABAJANDO";
  return "DISPONIBLE";
}

type Asignacion = {
  id: string;
  ordenTrabajo: {
    id: string;
    numero: string;
    nombre: string;
    cliente: string;
    equipo?: string;
    prioridad?: string;
    hhEstimadas?: number;
    hhConsumidas?: number;
  };
};

export default function TecnicoPage() {
  const { marcaje, loading, pausar, reanudar, finalizar, iniciar, cambiarActividad } =
    useMarcajeActivo({ pollInterval: 20_000 });
  const { marcajes: historial, totales, refetch: refetchHistory } = useHistorialHoy();
  const [actividades, setActividades] = useState<ActividadItem[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [showActs, setShowActs] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingAct, setPendingAct] = useState<ActividadItem | null>(null);
  const [showOFs, setShowOFs] = useState(false);

  useEffect(() => {
    apiClient
      .get<{ actividades: ActividadItem[] }>("/api/actividades")
      .then((d) => setActividades(d.actividades))
      .catch(() => {});
    apiClient
      .get<{ asignaciones: Asignacion[] }>("/api/ordenes/mis-asignaciones")
      .then((d) => setAsignaciones(d.asignaciones))
      .catch(() => {});
  }, []);

  const estado = getEstado(marcaje);
  const borderCol = getEstadoColor(estado);
  const isActive = !!marcaje && marcaje.horaFin === null;
  const isPaused = marcaje?.tipo === "PAUSA";

  const handlePausar = async () => {
    await pausar();
    await refetchHistory();
  };
  const handleReanudar = async () => {
    await reanudar();
    await refetchHistory();
  };
  const handleFinalizar = async () => {
    await finalizar();
    await refetchHistory();
  };

  const handleSelectAct = (a: ActividadItem) => {
    if (a.productiva && asignaciones.length > 0) {
      setPendingAct(a);
      setShowOFs(true);
    } else {
      void doStart(a.id);
    }
    setSheetOpen(false);
    setShowActs(false);
  };

  const doStart = async (actividadId: string, ofId?: string) => {
    if (isActive) await cambiarActividad(actividadId, ofId);
    else await iniciar(actividadId, ofId);
    await refetchHistory();
    setShowOFs(false);
    setPendingAct(null);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
      {/* OF card */}
      {marcaje?.ordenTrabajo && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200">
          <OFCard
            of={{
              ...marcaje.ordenTrabajo,
              prioridad: (marcaje.ordenTrabajo as { prioridad?: string }).prioridad,
              hhEstimadas: (marcaje.ordenTrabajo as { hhEstimadas?: number }).hhEstimadas,
              hhConsumidas: (marcaje.ordenTrabajo as { hhConsumidas?: number }).hhConsumidas,
            }}
            actividadNombre={marcaje.actividad.nombre}
          />
        </div>
      )}

      {/* Timer card */}
      <div
        className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center space-y-2"
        style={{ borderTopColor: borderCol, borderTopWidth: 3 }}
      >
        <EstadoPill estado={estado} />
        <TimerDisplay
          horaInicio={marcaje?.horaInicio ?? null}
          estado={estado}
          actividadNombre={marcaje?.actividad.nombre}
          size="md"
        />
        {marcaje?.horaInicio && (
          <p className="text-xs text-slate-400">
            desde{" "}
            {new Date(marcaje.horaInicio).toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
        {!marcaje && !loading && <p className="text-slate-400 text-sm">Sin actividad activa</p>}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        {!isPaused ? (
          <button
            onClick={handlePausar}
            disabled={!isActive}
            className={cn(
              "flex items-center justify-center gap-2 p-4 rounded-xl font-bold text-sm",
              "bg-amber-400 hover:bg-amber-500 text-black disabled:opacity-40 disabled:cursor-not-allowed",
              "transition-all active:scale-95"
            )}
          >
            <Pause size={20} /> Pausar
          </button>
        ) : (
          <button
            onClick={handleReanudar}
            className="flex items-center justify-center gap-2 p-4 rounded-xl font-bold text-sm bg-green-600 hover:bg-green-700 text-white transition-all active:scale-95"
          >
            <Play size={20} /> Reanudar
          </button>
        )}
        <button
          onClick={handleFinalizar}
          disabled={!isActive}
          className="flex items-center justify-center gap-2 p-4 rounded-xl font-bold text-sm bg-green-600 hover:bg-green-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          <CheckCircle size={20} /> Finalizar
        </button>
      </div>

      {/* Change activity button */}
      <button
        onClick={() => setSheetOpen(true)}
        className="w-full flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all"
      >
        <span className="font-medium text-slate-700 text-sm">Cambiar actividad</span>
        <ChevronRight size={18} className="text-slate-400" />
      </button>

      {/* Inline activity grid (collapsible for portrait) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <button
          onClick={() => setShowActs((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700"
        >
          Actividades rápidas
          {showActs ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showActs && (
          <div className="px-4 pb-4">
            <ActividadGrid actividades={actividades} onSelect={handleSelectAct} />
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
          Marcajes hoy
        </p>
        <MarcajeTimeline marcajes={historial} totales={totales} />
      </div>

      {/* Activity sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[80vh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Seleccionar actividad</SheetTitle>
          </SheetHeader>
          <ActividadGrid actividades={actividades} onSelect={handleSelectAct} />
        </SheetContent>
      </Sheet>

      {/* OF selection sheet */}
      <Sheet
        open={showOFs}
        onOpenChange={(v) => {
          setShowOFs(v);
          if (!v) setPendingAct(null);
        }}
      >
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle>{pendingAct?.nombre} — ¿en qué OF?</SheetTitle>
          </SheetHeader>
          <div className="space-y-2">
            {asignaciones.map((a) => (
              <button
                key={a.id}
                onClick={() => pendingAct && doStart(pendingAct.id, a.ordenTrabajo.id)}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
              >
                <div className="text-left">
                  <p className="font-semibold text-slate-800">OF-{a.ordenTrabajo.numero}</p>
                  <p className="text-slate-500 text-sm">{a.ordenTrabajo.nombre}</p>
                </div>
                <ChevronRight size={18} className="text-slate-400" />
              </button>
            ))}
            {pendingAct && (
              <button
                onClick={() => doStart(pendingAct.id)}
                className="w-full p-3 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition-all"
              >
                Sin OF específica
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
