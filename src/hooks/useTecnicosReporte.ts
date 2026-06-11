"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { TecnicoProductividad } from "@/types/reportes";

interface Options {
  sucursalId?: string;
  desde: string;
  hasta: string;
  enabled?: boolean;
}

export function useTecnicosReporte({ sucursalId, desde, hasta, enabled = true }: Options) {
  const [data, setData] = useState<TecnicoProductividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled || !desde || !hasta) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<{ data: TecnicoProductividad[] }>(
        `/api/reportes/productividad-tecnicos?${params}`
      );
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, desde, hasta, enabled]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
