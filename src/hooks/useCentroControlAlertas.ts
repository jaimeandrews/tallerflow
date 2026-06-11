"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { useSocket } from "./useSocket";
import type { AlertaActiva, AlertasActivasResponse } from "@/types/centro-control";

const POLL_WS_ACTIVE_MS = 5 * 60 * 1_000;
const POLL_WS_DISCONNECTED_MS = 60 * 1_000;

interface Options {
  sucursalId?: string;
  limite?: number;
}

const NIVEL_ORDER: Record<AlertaActiva["nivel"], number> = {
  critico: 0,
  warning: 1,
  info: 2,
};

function ordenar(a: AlertaActiva, b: AlertaActiva): number {
  const dn = NIVEL_ORDER[a.nivel] - NIVEL_ORDER[b.nivel];
  if (dn !== 0) return dn;
  return b.createdAt.localeCompare(a.createdAt);
}

export function useCentroControlAlertas({ sucursalId, limite = 20 }: Options = {}) {
  const { isConnected, socket, emit } = useSocket();
  const [alertas, setAlertas] = useState<AlertaActiva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshMs = isConnected ? POLL_WS_ACTIVE_MS : POLL_WS_DISCONNECTED_MS;

  const fetchAlertas = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limite: String(limite) });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<AlertasActivasResponse>(
        `/api/centro-control/alertas-activas?${params}`
      );
      setAlertas(res.alertas);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar alertas");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, limite]);

  useEffect(() => {
    fetchAlertas();
    const id = setInterval(fetchAlertas, refreshMs);
    return () => clearInterval(id);
  }, [fetchAlertas, refreshMs]);

  // Listeners realtime
  useEffect(() => {
    if (!socket) return;
    const onNueva = (payload: { alerta: AlertaActiva }) => {
      setAlertas((prev) => {
        if (prev.some((a) => a.id === payload.alerta.id)) return prev;
        const next = [payload.alerta, ...prev];
        return next.sort(ordenar).slice(0, limite);
      });
    };
    const onResuelta = (payload: { alertaId: string }) => {
      setAlertas((prev) => prev.filter((a) => a.id !== payload.alertaId));
    };
    socket.on("alerta:nueva", onNueva);
    socket.on("alerta:resuelta", onResuelta);
    return () => {
      socket.off("alerta:nueva", onNueva);
      socket.off("alerta:resuelta", onResuelta);
    };
  }, [socket, limite]);

  // Resolver via WS emit. Ack devuelve { ok, error? }.
  const resolver = useCallback(
    (alertaId: string): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        // Optimistic: remover de la lista local mientras el server responde
        setAlertas((prev) => prev.filter((a) => a.id !== alertaId));
        emit("alerta:resolver", { alertaId }, (response) => {
          if (response.ok) {
            resolve({ ok: true });
          } else {
            // Rollback — el server rechazó. Refrescar para resincronizar.
            void fetchAlertas();
            resolve({ ok: false, error: response.error });
          }
        });
      });
    },
    [emit, fetchAlertas]
  );

  return {
    alertas,
    loading,
    error,
    refetch: fetchAlertas,
    resolver,
    realtime: isConnected,
  };
}
