"use client";

import { useState } from "react";
import { useSocket } from "./useSocket";
import { useDashboardKpis } from "./useDashboardKpis";
import {
  type ChartPoint,
  type PeriodoChart,
  useDashboardProductividadChart,
} from "./useDashboardProductividadChart";
import { useTecnicosEnTaller } from "./useTecnicosEnTaller";
import { useDashboardOFCriticas } from "./useDashboardOFCriticas";
import { useDashboardTimeline } from "./useDashboardTimeline";
import type { DashboardKpis, OFCritica, TecnicoEnTaller, TimelineEvento } from "@/types/dashboard";

// ── Polling intervals ──────────────────────────────────────────────────────
// Intervalos adaptativos según el estado del WebSocket. Cada hook subyacente
// también escucha los eventos socket relevantes y hace refetch debounced
// (ver useDashboardKpis, useTecnicosEnTaller, etc.), por lo que con WS activo
// los datos llegan en tiempo real y el polling actúa solo como red de
// seguridad cada 5 minutos.
const POLL_WS_ACTIVE_MS = 5 * 60 * 1_000; // 5 min — safety net con WS conectado
const POLL_KPIS_MS = 60_000;
const POLL_OF_CRITICAS_MS = 60_000;
const POLL_TIMELINE_MS = 60_000;
const POLL_TECNICOS_MS = 30_000;
const POLL_CHART_MS = 300_000; // chart ya era costoso → 5 min en ambos modos

export type { ChartPoint, PeriodoChart };

interface UseDashboardOptions {
  sucursalId?: string;
  initialChartPeriodo?: PeriodoChart;
}

export interface DashboardKpisSection {
  data: DashboardKpis | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface DashboardChartSection {
  data: ChartPoint[];
  pico: { hora: string; valor: number };
  promedio: number;
  loading: boolean;
  error: string | null;
  periodo: PeriodoChart;
  setPeriodo: (p: PeriodoChart) => void;
  refetch: () => Promise<void>;
}

export interface DashboardTecnicosSection {
  data: TecnicoEnTaller[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface DashboardOFCriticasSection {
  data: OFCritica[];
  total: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface DashboardTimelineSection {
  data: TimelineEvento[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseDashboardResult {
  kpis: DashboardKpisSection;
  chart: DashboardChartSection;
  tecnicos: DashboardTecnicosSection;
  ofCriticas: DashboardOFCriticasSection;
  timeline: DashboardTimelineSection;
  refetchAll: () => void;
  /** true si el WebSocket está conectado (modo realtime activo). */
  realtime: boolean;
}

export function useDashboard(options: UseDashboardOptions = {}): UseDashboardResult {
  const { sucursalId, initialChartPeriodo = "hoy" } = options;
  const [chartPeriodo, setChartPeriodo] = useState<PeriodoChart>(initialChartPeriodo);

  const { isConnected } = useSocket();

  // Con WS activo, el polling baja a 5 min (safety net). Sin WS, mantenemos
  // los intervalos originales. Los hooks subyacentes escuchan eventos WS
  // directamente para refrescar al instante.
  const kpisInterval = isConnected ? POLL_WS_ACTIVE_MS : POLL_KPIS_MS;
  const tecnicosInterval = isConnected ? POLL_WS_ACTIVE_MS : POLL_TECNICOS_MS;
  const ofCriticasInterval = isConnected ? POLL_WS_ACTIVE_MS : POLL_OF_CRITICAS_MS;
  const timelineInterval = isConnected ? POLL_WS_ACTIVE_MS : POLL_TIMELINE_MS;

  const kpis = useDashboardKpis({ sucursalId, refreshMs: kpisInterval });

  const chart = useDashboardProductividadChart({
    sucursalId,
    periodo: chartPeriodo,
    refreshMs: POLL_CHART_MS,
  });

  const tecnicos = useTecnicosEnTaller({
    sucursalId,
    refreshMs: tecnicosInterval,
  });

  const ofCriticas = useDashboardOFCriticas({
    sucursalId,
    refreshMs: ofCriticasInterval,
  });

  const timeline = useDashboardTimeline({
    sucursalId,
    refreshMs: timelineInterval,
  });

  const refetchAll = () => {
    void kpis.refetch();
    void chart.refetch();
    void tecnicos.refetch();
    void ofCriticas.refetch();
    void timeline.refetch();
  };

  return {
    kpis: {
      data: kpis.data,
      loading: kpis.loading,
      error: kpis.error,
      refetch: kpis.refetch,
    },
    chart: {
      data: chart.data,
      pico: chart.pico,
      promedio: chart.promedio,
      loading: chart.loading,
      error: chart.error,
      periodo: chartPeriodo,
      setPeriodo: setChartPeriodo,
      refetch: chart.refetch,
    },
    tecnicos: {
      data: tecnicos.tecnicos,
      total: tecnicos.total,
      loading: tecnicos.loading,
      error: tecnicos.error,
      refetch: tecnicos.refetch,
    },
    ofCriticas: {
      data: ofCriticas.ordenes,
      total: ofCriticas.total,
      loading: ofCriticas.loading,
      error: ofCriticas.error,
      refetch: ofCriticas.refetch,
    },
    timeline: {
      data: timeline.eventos,
      loading: timeline.loading,
      error: timeline.error,
      refetch: timeline.refetch,
    },
    refetchAll,
    realtime: isConnected,
  };
}
