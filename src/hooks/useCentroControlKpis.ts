"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { CentroControlKpis } from "@/types/centro-control";

const POLL_WS_ACTIVE_MS = 5 * 60 * 1_000;
const POLL_WS_DISCONNECTED_MS = 60 * 1_000;
// Coalesce eventos socket en ráfaga para evitar múltiples fetches.
const REFETCH_DEBOUNCE_MS = 500;

interface UseCentroControlKpisOptions {
  sucursalId?: string;
}

export interface UseCentroControlKpisResult {
  data: CentroControlKpis | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  realtime: boolean;
  refreshMs: number;
}

export function useCentroControlKpis(
  options: UseCentroControlKpisOptions = {}
): UseCentroControlKpisResult {
  const { sucursalId } = options;
  const { isConnected, socket } = useSocket();

  const [data, setData] = useState<CentroControlKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMs = isConnected ? POLL_WS_ACTIVE_MS : POLL_WS_DISCONNECTED_MS;

  const fetchKpis = useCallback(async () => {
    try {
      const params = sucursalId ? `?sucursalId=${sucursalId}` : "";
      const res = await apiClient.get<CentroControlKpis>(`/api/centro-control/kpis${params}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar KPIs");
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  // Polling con frecuencia adaptativa según conexión socket.
  useEffect(() => {
    fetchKpis();
    if (refreshMs <= 0) return;
    const id = setInterval(fetchKpis, refreshMs);
    return () => clearInterval(id);
  }, [fetchKpis, refreshMs]);

  // Realtime: refetch debounced cuando ocurre algo que pueda mover los KPIs.
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!socket) return;

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchKpis();
      }, REFETCH_DEBOUNCE_MS);
    };

    socket.on("marcaje:nuevo", scheduleRefetch);
    socket.on("marcaje:actualizado", scheduleRefetch);
    socket.on("tecnico:estadoCambio", scheduleRefetch);
    socket.on("of:estadoCambio", scheduleRefetch);
    socket.on("alerta:nueva", scheduleRefetch);
    socket.on("alerta:resuelta", scheduleRefetch);

    return () => {
      socket.off("marcaje:nuevo", scheduleRefetch);
      socket.off("marcaje:actualizado", scheduleRefetch);
      socket.off("tecnico:estadoCambio", scheduleRefetch);
      socket.off("of:estadoCambio", scheduleRefetch);
      socket.off("alerta:nueva", scheduleRefetch);
      socket.off("alerta:resuelta", scheduleRefetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, fetchKpis]);

  return {
    data,
    loading,
    error,
    refetch: fetchKpis,
    realtime: isConnected,
    refreshMs,
  };
}
