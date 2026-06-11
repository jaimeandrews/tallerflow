"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { TecnicoEnTaller, TecnicosEnTallerResponse } from "@/types/dashboard";

const REFETCH_DEBOUNCE_MS = 300;

interface UseTecnicosEnTallerOptions {
  sucursalId?: string;
  limite?: number;
  refreshMs?: number;
}

export function useTecnicosEnTaller({
  sucursalId,
  limite = 12,
  refreshMs = 60_000,
}: UseTecnicosEnTallerOptions = {}) {
  const { socket } = useSocket();
  const [tecnicos, setTecnicos] = useState<TecnicoEnTaller[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTecnicos = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limite: String(limite) });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<TecnicosEnTallerResponse>(
        `/api/dashboard/tecnicos-en-taller?${params}`
      );
      setTecnicos(res.tecnicos);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar técnicos");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, limite]);

  useEffect(() => {
    fetchTecnicos();
    if (refreshMs <= 0) return;
    const id = setInterval(fetchTecnicos, refreshMs);
    return () => clearInterval(id);
  }, [fetchTecnicos, refreshMs]);

  // Realtime: refetch debounced en eventos que cambian estado/listado.
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!socket) return;
    const refetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void fetchTecnicos(), REFETCH_DEBOUNCE_MS);
    };
    socket.on("tecnico:estadoCambio", refetch);
    socket.on("marcaje:nuevo", refetch);
    socket.on("marcaje:actualizado", refetch);
    return () => {
      socket.off("tecnico:estadoCambio", refetch);
      socket.off("marcaje:nuevo", refetch);
      socket.off("marcaje:actualizado", refetch);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [socket, fetchTecnicos]);

  return { tecnicos, total, loading, error, refetch: fetchTecnicos };
}
