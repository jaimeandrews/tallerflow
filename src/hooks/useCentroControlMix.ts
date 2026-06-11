"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { MixActividadResponse } from "@/types/centro-control";

const POLL_WS_ACTIVE_MS = 5 * 60 * 1_000;
const POLL_WS_DISCONNECTED_MS = 60 * 1_000;
const REFETCH_DEBOUNCE_MS = 1_000;

interface Options {
  sucursalId?: string;
}

export function useCentroControlMix({ sucursalId }: Options = {}) {
  const { isConnected, socket } = useSocket();
  const [data, setData] = useState<MixActividadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMs = isConnected ? POLL_WS_ACTIVE_MS : POLL_WS_DISCONNECTED_MS;

  const fetchMix = useCallback(async () => {
    try {
      const params = sucursalId ? `?sucursalId=${sucursalId}` : "";
      const res = await apiClient.get<MixActividadResponse>(
        `/api/centro-control/mix-actividad${params}`
      );
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar mix");
    } finally {
      setLoading(false);
    }
  }, [sucursalId]);

  useEffect(() => {
    fetchMix();
    const id = setInterval(fetchMix, refreshMs);
    return () => clearInterval(id);
  }, [fetchMix, refreshMs]);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!socket) return;
    const refetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchMix(), REFETCH_DEBOUNCE_MS);
    };
    socket.on("marcaje:nuevo", refetch);
    socket.on("marcaje:actualizado", refetch);
    return () => {
      socket.off("marcaje:nuevo", refetch);
      socket.off("marcaje:actualizado", refetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, fetchMix]);

  return { data, loading, error, refetch: fetchMix };
}
