"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Pause, Play, CheckCircle, RefreshCw, LogOut, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PinInput } from "@/components/marcaje/PinInput";
import { TimerDisplay } from "@/components/marcaje/TimerDisplay";
import { EstadoPill, getEstadoColor } from "@/components/marcaje/EstadoPill";
import { ActividadGrid, type ActividadItem } from "@/components/marcaje/ActividadGrid";
import { MarcajeTimeline } from "@/components/marcaje/MarcajeTimeline";
import { OFCard } from "@/components/marcaje/OFCard";
import { BotonAccion } from "@/components/marcaje/BotonAccion";
import { useKiosko } from "@/contexts/kiosko-context";
import { useMarcajeActivo } from "@/hooks/useMarcajeActivo";
import { useHistorialHoy } from "@/hooks/useHistorialHoy";
import { useInactividadLogout } from "@/hooks/useInactividadLogout";
import { CountdownOverlay } from "@/components/marcaje/CountdownOverlay";
import { apiClient } from "@/lib/api-client";
import type { AuthUser } from "@/lib/auth/api-auth";
import type { MarcajeActivo } from "@/types/marcaje";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEstado(marcaje: MarcajeActivo | null): string {
  if (!marcaje) return "DISPONIBLE";
  if (marcaje.tipo === "PAUSA") return "PAUSA";
  if (marcaje.actividad.nombre === "Almuerzo") return "ALMUERZO";
  if (marcaje.actividad.nombre === "Espera repuesto") return "DETENIDO";
  if (marcaje.actividad.productiva) return "TRABAJANDO";
  return "DISPONIBLE";
}

function bordColor(estado: string) {
  return getEstadoColor(estado);
}

// ─── PIN Screen ───────────────────────────────────────────────────────────────

function PinScreen() {
  const { sucursalId, setAuth } = useKiosko();

  const handlePin = async (pin: string) => {
    const data = await apiClient.post<{
      token: string;
      jti: string;
      expiresAt: number;
      user: AuthUser;
    }>("/api/auth/pin", { pin, sucursalId });
    setAuth(data.user, data.token, data.jti, data.expiresAt);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 px-4">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-white">Identificación del técnico</h1>
        <p className="text-white/50 text-base">Ingresa tu PIN de 4 dígitos</p>
      </div>
      <PinInput onSubmit={handlePin} />
    </div>
  );
}

// ─── Quick Access Row ─────────────────────────────────────────────────────────

interface QuickAccessProps {
  actividades: ActividadItem[];
  onSelect: (a: ActividadItem) => void;
}

function QuickAccess({ actividades, onSelect }: QuickAccessProps) {
  const quick = actividades.slice(0, 4);
  if (quick.length === 0) return null;
  return (
    <div className="grid grid-cols-4 gap-2">
      {quick.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(a)}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-95"
        >
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.color }} />
          <span className="text-xs text-white/70 text-center leading-tight font-medium">
            {a.nombre}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  user,
  token,
  onLogout,
}: {
  user: AuthUser;
  token: string;
  onLogout: () => void;
}) {
  const { marcaje, loading, pausar, reanudar, finalizar, iniciar, cambiarActividad } =
    useMarcajeActivo({ token, pollInterval: 15_000 });
  const { marcajes: historial, totales, refetch: refetchHistory } = useHistorialHoy(token);
  const [actividades, setActividades] = useState<ActividadItem[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingActividad, setPendingActividad] = useState<ActividadItem | null>(null);
  const [asignaciones, setAsignaciones] = useState<
    Array<{
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
    }>
  >([]);
  const [showOFs, setShowOFs] = useState(false);

  const { countdown } = useInactividadLogout(() => {
    toast.info("Sesión cerrada por inactividad");
    onLogout();
  });

  // Load actividades once
  useEffect(() => {
    apiClient
      .get<{ actividades: ActividadItem[] }>("/api/actividades", token)
      .then((d) => setActividades(d.actividades))
      .catch(() => {});
  }, [token]);

  // Load asignaciones once
  useEffect(() => {
    apiClient
      .get<{ asignaciones: typeof asignaciones }>("/api/ordenes/mis-asignaciones", token)
      .then((d) => setAsignaciones(d.asignaciones))
      .catch(() => {});
  }, [token]);

  const estado = getEstado(marcaje);
  const borderCol = bordColor(estado);
  const isActive = !!marcaje && marcaje.horaFin === null;
  const isPaused = marcaje?.tipo === "PAUSA";

  const handleSelectActividad = (a: ActividadItem) => {
    // Productivas may need OF selection; non-productive go directly
    if (a.productiva && asignaciones.length > 0) {
      setPendingActividad(a);
      setShowOFs(true);
    } else {
      void doStart(a.id, undefined);
    }
    setSheetOpen(false);
  };

  const doStart = async (actividadId: string, ofId?: string) => {
    if (isActive) {
      await cambiarActividad(actividadId, ofId);
    } else {
      await iniciar(actividadId, ofId);
    }
    await refetchHistory();
    setShowOFs(false);
    setPendingActividad(null);
  };

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

  return (
    <>
      <div className="h-full grid p-4 gap-4" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        {/* ── Left column ─────────────────────────────── */}
        <div className="flex flex-col gap-4 min-h-0">
          {/* Timer card */}
          <div
            className="flex-1 rounded-2xl p-6 flex flex-col gap-5 border border-white/8 min-h-0"
            style={{
              backgroundColor: "#111111",
              borderTopColor: borderCol,
              borderTopWidth: 3,
            }}
          >
            {/* OF info */}
            {marcaje?.ordenTrabajo ? (
              <OFCard
                of={{
                  ...marcaje.ordenTrabajo,
                  prioridad: (marcaje.ordenTrabajo as { prioridad?: string }).prioridad,
                  hhEstimadas: (marcaje.ordenTrabajo as { hhEstimadas?: number }).hhEstimadas,
                  hhConsumidas: (marcaje.ordenTrabajo as { hhConsumidas?: number }).hhConsumidas,
                }}
                actividadNombre={marcaje.actividad.nombre}
                dark
              />
            ) : (
              !loading && (
                <p className="text-white/30 text-sm">
                  Sin actividad · selecciona una actividad para comenzar
                </p>
              )
            )}

            {/* Timer */}
            <div className="flex-1 flex items-center justify-center">
              <TimerDisplay
                horaInicio={marcaje?.horaInicio ?? null}
                estado={estado}
                actividadNombre={marcaje?.actividad.nombre}
                size="lg"
              />
            </div>

            {/* desde label */}
            {marcaje?.horaInicio && (
              <p className="text-center text-xs text-white/35">
                desde{" "}
                {new Date(marcaje.horaInicio).toLocaleTimeString("es-CL", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-3 gap-3">
            {!isPaused ? (
              <BotonAccion
                label="Pausar"
                icon={<Pause size={26} />}
                onClick={handlePausar}
                variant="warning"
                disabled={!isActive}
              />
            ) : (
              <BotonAccion
                label="Reanudar"
                icon={<Play size={26} />}
                onClick={handleReanudar}
                variant="success"
              />
            )}
            <BotonAccion
              label="Finalizar"
              icon={<CheckCircle size={26} />}
              onClick={handleFinalizar}
              variant="success"
              disabled={!isActive}
            />
            <BotonAccion
              label="Cambiar"
              icon={<RefreshCw size={26} />}
              onClick={() => setSheetOpen(true)}
              variant="neutral"
            />
          </div>
        </div>

        {/* ── Right column ────────────────────────────── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          {/* User card */}
          <div className="rounded-2xl p-4 border border-white/8 bg-[#111] flex-shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <Avatar
                className="w-12 h-12 border-2"
                style={{ borderColor: isActive ? "#2C8A4A" : "#6E7278" }}
              >
                <AvatarFallback
                  className="text-white font-bold text-lg"
                  style={{ backgroundColor: user.color }}
                >
                  {user.iniciales}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">
                  {user.nombre} {user.apellido}
                </p>
                <EstadoPill estado={estado} className="mt-0.5" />
              </div>
              <button
                onClick={onLogout}
                className="text-white/30 hover:text-white/70 transition-colors p-1"
                title="Cerrar sesión"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {/* History */}
          <div className="rounded-2xl p-4 border border-white/8 bg-[#111] flex-1 min-h-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
              Marcajes hoy
            </p>
            <MarcajeTimeline marcajes={historial} totales={totales} dark />
          </div>

          {/* Quick access */}
          <div className="rounded-2xl p-4 border border-white/8 bg-[#111] flex-shrink-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">
              Acceso rápido
            </p>
            <QuickAccess actividades={actividades} onSelect={handleSelectActividad} />
          </div>
        </div>
      </div>

      {/* ── Activity selection sheet ─────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="border-white/15 rounded-t-3xl max-h-[80vh] overflow-y-auto"
          style={{ backgroundColor: "#161616" }}
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="text-white">Seleccionar actividad</SheetTitle>
          </SheetHeader>
          <ActividadGrid actividades={actividades} onSelect={handleSelectActividad} dark />
        </SheetContent>
      </Sheet>

      {/* ── OF selection sheet ───────────────────────── */}
      <Sheet
        open={showOFs}
        onOpenChange={(v) => {
          setShowOFs(v);
          if (!v) setPendingActividad(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="border-white/15 rounded-t-3xl"
          style={{ backgroundColor: "#161616" }}
        >
          <SheetHeader className="mb-4">
            <SheetTitle className="text-white">{pendingActividad?.nombre} — ¿en qué OF?</SheetTitle>
          </SheetHeader>
          <div className="space-y-2">
            {asignaciones.map((a) => (
              <button
                key={a.id}
                onClick={() => pendingActividad && doStart(pendingActividad.id, a.ordenTrabajo.id)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
              >
                <div className="text-left">
                  <p className="text-white font-semibold">OF-{a.ordenTrabajo.numero}</p>
                  <p className="text-white/50 text-sm">{a.ordenTrabajo.nombre}</p>
                </div>
                <ChevronRight size={18} className="text-white/30" />
              </button>
            ))}
            {pendingActividad && (
              <button
                onClick={() => doStart(pendingActividad.id)}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 text-sm transition-all"
              >
                Sin OF específica
              </button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Countdown warning before auto-logout */}
      {countdown !== null && <CountdownOverlay countdown={countdown} />}
    </>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function MarcajePage() {
  const { user, token, clearAuth } = useKiosko();

  if (!user || !token) return <PinScreen />;

  return <Dashboard user={user} token={token} onLogout={clearAuth} />;
}
