"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { SucursalProductividad } from "@/types/reportes";

export function useSucursalesReporte({
  desde,
  hasta,
  enabled = true,
}: {
  desde: string;
  hasta: string;
  enabled?: boolean;
}) {
  const [data, setData] = useState<SucursalProductividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled || !desde || !hasta) return;
    setLoading(true);
    try {
      const res = await apiClient.get<{ data: SucursalProductividad[] }>(
        `/api/reportes/productividad-sucursal?desde=${desde}&hasta=${hasta}`
      );
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, enabled]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
