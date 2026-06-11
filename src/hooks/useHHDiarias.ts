"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";

export interface HHDiaria {
  fecha: string;
  label: string; // MM-DD
  hhProductivas: number;
  hhNoProductivas: number;
}

export function useHHDiarias({
  sucursalId,
  desde,
  hasta,
  enabled = true,
}: {
  sucursalId?: string;
  desde: string;
  hasta: string;
  enabled?: boolean;
}) {
  const [data, setData] = useState<HHDiaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled || !desde || !hasta) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<{ data: HHDiaria[] }>(`/api/reportes/hh-diarias?${params}`);
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [sucursalId, desde, hasta, enabled]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
