"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { OFCritica, OFCriticasResponse } from "@/types/dashboard";

const REFETCH_DEBOUNCE_MS = 500;

interface UseDashboardOFCriticasOptions {
  sucursalId?: string;
  limite?: number;
  refreshMs?: number;
}

export function useDashboardOFCriticas({
  sucursalId,
  limite = 5,
  refreshMs = 60_000,
}: UseDashboardOFCriticasOptions = {}) {
  const { socket } = useSocket();
  const [ordenes, setOrdenes] = useState<OFCritica[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrdenes = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limite: String(limite) });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<OFCriticasResponse>(`/api/dashboard/of-criticas?${params}`);
      setOrdenes(res.ordenes);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar OF críticas");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, limite]);

  useEffect(() => {
    fetchOrdenes();
    if (refreshMs <= 0) return;
    const id = setInterval(fetchOrdenes, refreshMs);
    return () => clearInterval(id);
  }, [fetchOrdenes, refreshMs]);

  // Realtime: refetch debounced en eventos que cambian OF críticas.
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!socket) return;
    const refetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchOrdenes(), REFETCH_DEBOUNCE_MS);
    };
    socket.on("of:estadoCambio", refetch);
    socket.on("alerta:nueva", refetch);
    socket.on("alerta:resuelta", refetch);
    socket.on("marcaje:actualizado", refetch);
    return () => {
      socket.off("of:estadoCambio", refetch);
      socket.off("alerta:nueva", refetch);
      socket.off("alerta:resuelta", refetch);
      socket.off("marcaje:actualizado", refetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, fetchOrdenes]);

  return { ordenes, total, loading, error, refetch: fetchOrdenes };
}
