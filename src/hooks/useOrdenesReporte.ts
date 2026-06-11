"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type { OFProductividad } from "@/types/reportes";

export function useOrdenesReporte({
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
  const [data, setData] = useState<OFProductividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled || !desde || !hasta) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<{ data: OFProductividad[] }>(
        `/api/reportes/productividad-of?${params}`
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

// ── Hook para segmentos de una OF específica ───────────────────────────────

interface OFSegmento {
  id: string;
  tipo: string;
  color: string;
  actividad: string;
  inicio: string;
  fin: string;
  duracionMinutos: number;
  tecnico: { id: string; nombre: string; iniciales: string; color: string };
}

export function useOFMarcajes({
  ofId,
  desde,
  hasta,
  enabled,
}: {
  ofId: string | null;
  desde: string;
  hasta: string;
  enabled: boolean;
}) {
  const [segments, setSegments] = useState<OFSegmento[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !ofId || !desde || !hasta) return;
    setLoading(true);
    apiClient
      .get<{ segments: OFSegmento[] }>(
        `/api/reportes/of-marcajes?ofId=${ofId}&desde=${desde}&hasta=${hasta}`
      )
      .then((res) => {
        setSegments(res.segments);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => setLoading(false));
  }, [ofId, desde, hasta, enabled]);

  return { segments, loading, error };
}
