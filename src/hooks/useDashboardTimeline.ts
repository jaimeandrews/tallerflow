"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { TimelineEvento, TimelineResponse } from "@/types/dashboard";

const REFETCH_DEBOUNCE_MS = 300;

interface UseDashboardTimelineOptions {
  sucursalId?: string;
  limite?: number;
  refreshMs?: number;
}

export function useDashboardTimeline({
  sucursalId,
  limite = 10,
  refreshMs = 30_000,
}: UseDashboardTimelineOptions = {}) {
  const { socket } = useSocket();
  const [eventos, setEventos] = useState<TimelineEvento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limite: String(limite) });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<TimelineResponse>(`/api/dashboard/timeline?${params}`);
      setEventos(res.eventos);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar timeline");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, limite]);

  useEffect(() => {
    fetchTimeline();
    if (refreshMs <= 0) return;
    const id = setInterval(fetchTimeline, refreshMs);
    return () => clearInterval(id);
  }, [fetchTimeline, refreshMs]);

  // Realtime: refetch corto al recibir cualquier marcaje. (Podríamos hacer
  // prepend optimista, pero el refetch garantiza consistencia con el orden y
  // los campos derivados del backend — tono, texto compuesto, etc.)
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!socket) return;
    const refetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchTimeline(), REFETCH_DEBOUNCE_MS);
    };
    socket.on("marcaje:nuevo", refetch);
    socket.on("marcaje:actualizado", refetch);
    return () => {
      socket.off("marcaje:nuevo", refetch);
      socket.off("marcaje:actualizado", refetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, fetchTimeline]);

  return { eventos, loading, error, refetch: fetchTimeline };
}
