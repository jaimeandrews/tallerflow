"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { enqueueMarcaje, isOnline } from "@/lib/offline/offline-queue";
import { syncPending, startAutoSync } from "@/lib/offline/offline-sync";
import type { MarcajeActivo } from "@/types/marcaje";

interface Options {
  token?: string;
  pollInterval?: number;
}

const OFFLINE_TOAST = "⚡ Offline — se sincronizará al recuperar conexión";

export function useMarcajeActivo(options?: Options) {
  const { token, pollInterval = 30_000 } = options ?? {};
  const [marcaje, setMarcaje] = useState<MarcajeActivo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!isOnline()) {
      // No /api/marcaje/activo cache — keep current local state
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.get<{ marcaje: MarcajeActivo | null }>(
        "/api/marcaje/activo",
        token
      );
      setMarcaje(data.marcaje);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const init = setTimeout(() => void refetch(), 0);
    const id = setInterval(() => void refetch(), pollInterval);
    return () => {
      clearTimeout(init);
      clearInterval(id);
    };
  }, [refetch, pollInterval]);

  // Auto-sync when network returns
  useEffect(() => {
    const stop = startAutoSync(() => token);
    return () => {
      stop();
    };
  }, [token]);

  const runOnlineOrEnqueue = async (
    onlineFn: () => Promise<unknown>,
    offlinePayload: {
      actividadId: string;
      ordenTrabajoId?: string;
      tipo: "INICIO" | "FIN" | "PAUSA" | "REANUDACION";
      notas?: string;
    }
  ) => {
    if (isOnline()) {
      try {
        await onlineFn();
        await refetch();
        // also flush any pending from previous offline sessions
        await syncPending({ token, silent: true });
        return;
      } catch (err) {
        // If the network died mid-flight, fall through to queue
        if (!isOnline()) {
          await enqueueMarcaje(offlinePayload);
          toast.info(OFFLINE_TOAST);
          return;
        }
        throw err;
      }
    }
    // Offline path
    await enqueueMarcaje(offlinePayload);
    toast.info(OFFLINE_TOAST);
  };

  const pausar = async (motivo?: string) => {
    const actividadId = marcaje?.actividad.id ?? "";
    await runOnlineOrEnqueue(() => apiClient.post("/api/marcaje/pausar", { motivo }, token), {
      actividadId,
      ordenTrabajoId: marcaje?.ordenTrabajo?.id,
      tipo: "PAUSA",
      notas: motivo,
    });
  };

  const reanudar = async () => {
    const actividadId = marcaje?.actividad.id ?? "";
    await runOnlineOrEnqueue(() => apiClient.post("/api/marcaje/reanudar", {}, token), {
      actividadId,
      ordenTrabajoId: marcaje?.ordenTrabajo?.id,
      tipo: "REANUDACION",
    });
  };

  const finalizar = async (notas?: string) => {
    const actividadId = marcaje?.actividad.id ?? "";
    await runOnlineOrEnqueue(() => apiClient.post("/api/marcaje/finalizar", { notas }, token), {
      actividadId,
      ordenTrabajoId: marcaje?.ordenTrabajo?.id,
      tipo: "FIN",
      notas,
    });
  };

  const iniciar = async (actividadId: string, ordenTrabajoId?: string) => {
    await runOnlineOrEnqueue(
      () => apiClient.post("/api/marcaje/iniciar", { actividadId, ordenTrabajoId }, token),
      { actividadId, ordenTrabajoId, tipo: "INICIO" }
    );
  };

  const cambiarActividad = async (actividadId: string, ordenTrabajoId?: string) => {
    await runOnlineOrEnqueue(
      () =>
        apiClient.post("/api/marcaje/cambiar-actividad", { actividadId, ordenTrabajoId }, token),
      { actividadId, ordenTrabajoId, tipo: "INICIO" }
    );
  };

  return {
    marcaje,
    loading,
    error,
    refetch,
    pausar,
    reanudar,
    finalizar,
    iniciar,
    cambiarActividad,
  };
}
