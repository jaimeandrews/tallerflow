"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { ResumenPeriodo } from "@/types/reportes";

interface Options {
  sucursalId?: string;
  desde: string;
  hasta: string;
  enabled?: boolean;
}

export function useResumenPeriodo({ sucursalId, desde, hasta, enabled = true }: Options) {
  const [data, setData] = useState<ResumenPeriodo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchResumen = useCallback(async () => {
    if (!enabled || !desde || !hasta) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<ResumenPeriodo>(`/api/reportes/resumen-periodo?${params}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar resumen");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, desde, hasta, enabled]);

  useEffect(() => {
    void fetchResumen();
  }, [fetchResumen]);

  return { data, loading, error, refetch: fetchResumen };
}
