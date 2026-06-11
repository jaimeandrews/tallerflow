"use client";

import { useEffect, useState } from "react";
import { useDashboardKpis } from "./useDashboardKpis";
import { useSocket } from "./useSocket";
import type { DashboardKpis } from "@/types/dashboard";

// Polling adaptativo:
// - WS conectado → 5 min como red de seguridad (eventos pushean en tiempo real)
// - WS desconectado → 60s (fallback estándar del dashboard)
const POLL_WS_ACTIVE_MS = 5 * 60 * 1_000;
const POLL_WS_DISCONNECTED_MS = 60 * 1_000;

interface UseRealtimeKpisOptions {
  sucursalId?: string;
}

export interface UseRealtimeKpisResult {
  data: DashboardKpis | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** true si el WebSocket está conectado (modo tiempo real activo). */
  realtime: boolean;
  /** Intervalo de polling actual en ms (5 min con WS, 60s sin). */
  refreshMs: number;
}

export function useRealtimeKpis(options: UseRealtimeKpisOptions = {}): UseRealtimeKpisResult {
  const { isConnected, socket } = useSocket();
  const refreshMs = isConnected ? POLL_WS_ACTIVE_MS : POLL_WS_DISCONNECTED_MS;

  const polling = useDashboardKpis({
    sucursalId: options.sucursalId,
    refreshMs,
  });

  // Estado local: lo último que vimos (sea por polling o por evento socket).
  // El polling sigue corriendo como red de seguridad y autoritativo en el
  // refresh largo. Si llegan eventos socket, se actualizan inmediatamente.
  const [data, setData] = useState<DashboardKpis | null>(null);

  // Sincroniza data ← polling (cuando el polling refresca, sobrescribe).
  useEffect(() => {
    if (polling.data) setData(polling.data);
  }, [polling.data]);

  // Sincroniza data ← socket "kpi:actualizado"
  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { kpis: DashboardKpis }) => {
      setData(payload.kpis);
    };
    socket.on("kpi:actualizado", handler);
    return () => {
      socket.off("kpi:actualizado", handler);
    };
  }, [socket]);

  return {
    data: data ?? polling.data,
    loading: polling.loading,
    error: polling.error,
    refetch: polling.refetch,
    realtime: isConnected,
    refreshMs,
  };
}
