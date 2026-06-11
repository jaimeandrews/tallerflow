"use client";

import { useEffect, useMemo } from "react";
import { Wifi, WifiOff } from "lucide-react";
import type { EstadoTecnico } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { useTecnicosEnTaller } from "@/hooks/useTecnicosEnTaller";
import { useSocket } from "@/hooks/useSocket";
import { useAlertaNotifications } from "@/hooks/useAlertaNotifications";
import { useCentroControlKpis } from "@/hooks/useCentroControlKpis";
import { useCentroControlRibbon } from "@/hooks/useCentroControlRibbon";
import { useCentroControlMix } from "@/hooks/useCentroControlMix";
import { useCentroControlAlertas } from "@/hooks/useCentroControlAlertas";
import { KpisFilaCentroControl } from "@/components/centro-control/kpis-fila";
import { GridTecnicosLive } from "@/components/centro-control/grid-tecnicos-live";
import { OFRibbonTimeline } from "@/components/centro-control/of-ribbon-timeline";
import { PanelAlertas } from "@/components/centro-control/panel-alertas";
import { MixActividad } from "@/components/centro-control/mix-actividad";
import {
  NocModeProvider,
  NocModeToggle,
  NocWrapper,
  useNocMode,
} from "@/components/centro-control/modo-noc";
import { useSucursalActiva } from "@/contexts/sucursal-context";

interface Props {
  sucursalActivaId: string;
  sucursalActivaNombre: string;
  turnoNombre: string | null;
  canSelectSucursal: boolean;
}

// Pills de estado (5 estados del enum).
const PILL_CONFIG: Record<EstadoTecnico, { label: string; bg: string; text: string; dot: string }> =
  {
    TRABAJANDO: {
      label: "trabajando",
      bg: "bg-green-100",
      text: "text-green-700",
      dot: "bg-green-500",
    },
    PAUSA: {
      label: "en pausa",
      bg: "bg-yellow-100",
      text: "text-yellow-700",
      dot: "bg-yellow-400",
    },
    ALMUERZO: {
      label: "almuerzo",
      bg: "bg-blue-100",
      text: "text-blue-700",
      dot: "bg-blue-400",
    },
    DETENIDO: {
      label: "detenido",
      bg: "bg-red-100",
      text: "text-red-700",
      dot: "bg-red-500",
    },
    DISPONIBLE: {
      label: "disponible",
      bg: "bg-slate-100",
      text: "text-slate-600",
      dot: "bg-slate-400",
    },
  };

const PILL_CONFIG_NOC: Record<EstadoTecnico, { bg: string; text: string }> = {
  TRABAJANDO: { bg: "bg-green-500/15 border-green-500/40", text: "text-green-300" },
  PAUSA: { bg: "bg-yellow-500/15 border-yellow-500/40", text: "text-yellow-300" },
  ALMUERZO: { bg: "bg-blue-500/15 border-blue-500/40", text: "text-blue-300" },
  DETENIDO: { bg: "bg-red-500/15 border-red-500/40", text: "text-red-300" },
  DISPONIBLE: { bg: "bg-slate-500/15 border-slate-500/40", text: "text-slate-300" },
};

const ESTADO_ORDER: EstadoTecnico[] = ["TRABAJANDO", "PAUSA", "ALMUERZO", "DETENIDO", "DISPONIBLE"];

export function CentroControlPageClient(props: Props) {
  return (
    <NocModeProvider>
      <CentroControlContent {...props} />
    </NocModeProvider>
  );
}

function CentroControlContent({
  sucursalActivaId: _initialId,
  sucursalActivaNombre: _initialNombre,
  turnoNombre,
  canSelectSucursal,
}: Props) {
  const { nocMode } = useNocMode();
  const { sucursalActivaId, sucursalActiva } = useSucursalActiva();
  const sucursalActivaNombre = sucursalActiva.nombre;
  const sucursalIdParam = canSelectSucursal ? sucursalActivaId : undefined;

  const {
    tecnicos,
    loading: tecnicosLoading,
    error: tecnicosError,
    refetch,
  } = useTecnicosEnTaller({ sucursalId: sucursalIdParam, limite: 100 });

  const { isConnected, socket } = useSocket();

  useAlertaNotifications();

  const ccKpis = useCentroControlKpis({ sucursalId: sucursalIdParam });
  const ribbon = useCentroControlRibbon({ sucursalId: sucursalIdParam });
  const mix = useCentroControlMix({ sucursalId: sucursalIdParam });
  const alertas = useCentroControlAlertas({ sucursalId: sucursalIdParam });

  // Refetch al recibir eventos que cambian el conteo de técnicos.
  useEffect(() => {
    if (!socket) return;
    const handler = () => void refetch();
    socket.on("tecnico:estadoCambio", handler);
    socket.on("marcaje:nuevo", handler);
    socket.on("marcaje:actualizado", handler);
    return () => {
      socket.off("tecnico:estadoCambio", handler);
      socket.off("marcaje:nuevo", handler);
      socket.off("marcaje:actualizado", handler);
    };
  }, [socket, refetch]);

  const conteos = useMemo(() => {
    const map: Record<EstadoTecnico, number> = {
      TRABAJANDO: 0,
      PAUSA: 0,
      ALMUERZO: 0,
      DETENIDO: 0,
      DISPONIBLE: 0,
    };
    for (const t of tecnicos) {
      map[t.estado] = (map[t.estado] ?? 0) + 1;
    }
    return map;
  }, [tecnicos]);

  const subtexto = `${sucursalActivaNombre}${turnoNombre ? ` · turno ${turnoNombre.toLowerCase()}` : ""} · estado del taller en tiempo real`;

  return (
    <NocWrapper>
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1
              className={cn(
                "text-2xl font-bold truncate",
                nocMode ? "text-white" : "text-slate-800"
              )}
            >
              Centro de control operacional
            </h1>
            <RealtimeBadge connected={isConnected} dark={nocMode} />
          </div>
          <p className={cn("mt-1 text-sm", nocMode ? "text-slate-400" : "text-slate-500")}>
            {subtexto}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <NocModeToggle />
        </div>
      </header>

      {/* Pills de resumen */}
      <PillsResumen conteos={conteos} dark={nocMode} />

      {/* KPIs */}
      <KpisFilaCentroControl
        kpis={ccKpis.data}
        loading={ccKpis.loading && !ccKpis.data}
        error={ccKpis.error}
      />

      {/* Layout principal: 2 columnas (grow · 340px) */}
      <div className="grid gap-4 min-[1200px]:grid-cols-[1fr_340px]">
        <div className="space-y-4 min-w-0">
          <GridTecnicosLive tecnicos={tecnicos} loading={tecnicosLoading} error={tecnicosError} />
          <OFRibbonTimeline data={ribbon.data} loading={ribbon.loading} error={ribbon.error} />
        </div>

        <div className="space-y-4">
          <PanelAlertas
            alertas={alertas.alertas}
            loading={alertas.loading}
            error={alertas.error}
            onResolver={alertas.resolver}
          />
          <MixActividad data={mix.data} loading={mix.loading} error={mix.error} />
        </div>
      </div>
    </NocWrapper>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function RealtimeBadge({ connected, dark }: { connected: boolean; dark: boolean }) {
  if (connected) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          dark ? "bg-green-500/20 text-green-300" : "bg-green-100 text-green-700"
        )}
        title="Conectado al servidor en tiempo real"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500" />
        </span>
        <Wifi className="h-3 w-3" />
        EN VIVO
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        dark ? "bg-slate-700 text-slate-300" : "bg-slate-200 text-slate-600"
      )}
      title="Sin conexión en tiempo real — usando polling"
    >
      <WifiOff className="h-3 w-3" />
      SIN CONEXIÓN
    </span>
  );
}

function PillsResumen({
  conteos,
  dark,
}: {
  conteos: Record<EstadoTecnico, number>;
  dark: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ESTADO_ORDER.map((estado) => {
        const n = conteos[estado];
        if (dark) {
          const cfg = PILL_CONFIG_NOC[estado];
          return (
            <span
              key={estado}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",
                cfg.bg,
                cfg.text
              )}
            >
              <span className={cn("inline-block h-2 w-2 rounded-full", PILL_CONFIG[estado].dot)} />
              <span className="tabular-nums">{n}</span>
              <span className="font-medium opacity-80">{PILL_CONFIG[estado].label}</span>
            </span>
          );
        }
        const cfg = PILL_CONFIG[estado];
        return (
          <span
            key={estado}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
              cfg.bg,
              cfg.text
            )}
          >
            <span className={cn("inline-block h-2 w-2 rounded-full", cfg.dot)} />
            <span className="tabular-nums">{n}</span>
            <span className="font-medium">{cfg.label}</span>
          </span>
        );
      })}
    </div>
  );
}
