"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { DashboardKpis } from "@/types/dashboard";

const REFETCH_DEBOUNCE_MS = 500;

interface UseDashboardKpisOptions {
  sucursalId?: string;
  refreshMs?: number;
}

export function useDashboardKpis(options: UseDashboardKpisOptions = {}) {
  const { sucursalId, refreshMs = 60_000 } = options;
  const { socket } = useSocket();
  const [data, setData] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchKpis = useCallback(async () => {
    try {
      const params = sucursalId ? `?sucursalId=${sucursalId}` : "";
      const res = await apiClient.get<DashboardKpis>(`/api/dashboard/kpis${params}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar KPIs");
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    fetchKpis();
    if (refreshMs <= 0) return;
    const id = setInterval(fetchKpis, refreshMs);
    return () => clearInterval(id);
  }, [fetchKpis, refreshMs]);

  // ── Realtime: refetch debounced ante eventos que mueven los KPIs ─────────
  // O bien, si llega "kpi:actualizado" con payload completo, lo aplicamos
  // directamente sin refetch.
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!socket) return;

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchKpis(), REFETCH_DEBOUNCE_MS);
    };
    const onKpisSnapshot = (payload: { kpis: DashboardKpis }) => {
      setData(payload.kpis);
    };

    socket.on("kpi:actualizado", onKpisSnapshot);
    socket.on("marcaje:nuevo", scheduleRefetch);
    socket.on("marcaje:actualizado", scheduleRefetch);
    socket.on("tecnico:estadoCambio", scheduleRefetch);
    socket.on("of:estadoCambio", scheduleRefetch);
    socket.on("alerta:nueva", scheduleRefetch);
    socket.on("alerta:resuelta", scheduleRefetch);

    return () => {
      socket.off("kpi:actualizado", onKpisSnapshot);
      socket.off("marcaje:nuevo", scheduleRefetch);
      socket.off("marcaje:actualizado", scheduleRefetch);
      socket.off("tecnico:estadoCambio", scheduleRefetch);
      socket.off("of:estadoCambio", scheduleRefetch);
      socket.off("alerta:nueva", scheduleRefetch);
      socket.off("alerta:resuelta", scheduleRefetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, fetchKpis]);

  return { data, loading, error, refetch: fetchKpis };
}
