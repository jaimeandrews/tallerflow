"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { RibbonResponse } from "@/types/centro-control";

const POLL_WS_ACTIVE_MS = 5 * 60 * 1_000;
const POLL_WS_DISCONNECTED_MS = 60 * 1_000;
const REFETCH_DEBOUNCE_MS = 500;

interface Options {
  sucursalId?: string;
  limite?: number;
}

export function useCentroControlRibbon({ sucursalId, limite = 8 }: Options = {}) {
  const { isConnected, socket } = useSocket();
  const [data, setData] = useState<RibbonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMs = isConnected ? POLL_WS_ACTIVE_MS : POLL_WS_DISCONNECTED_MS;

  const fetchRibbon = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limite: String(limite) });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<RibbonResponse>(`/api/centro-control/of-ribbon?${params}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar ribbon");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, limite]);

  useEffect(() => {
    fetchRibbon();
    const id = setInterval(fetchRibbon, refreshMs);
    return () => clearInterval(id);
  }, [fetchRibbon, refreshMs]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!socket) return;
    const refetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchRibbon(), REFETCH_DEBOUNCE_MS);
    };
    socket.on("marcaje:nuevo", refetch);
    socket.on("marcaje:actualizado", refetch);
    socket.on("of:estadoCambio", refetch);
    return () => {
      socket.off("marcaje:nuevo", refetch);
      socket.off("marcaje:actualizado", refetch);
      socket.off("of:estadoCambio", refetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, fetchRibbon]);

  return { data, loading, error, refetch: fetchRibbon, realtime: isConnected };
}
