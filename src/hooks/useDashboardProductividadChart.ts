"use client";

import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import type {
  ProductividadChartResponse,
  ProductividadPuntoDia,
  ProductividadPuntoHora,
} from "@/types/dashboard";

export type PeriodoChart = "hoy" | "7d" | "30d";

export interface ChartPoint {
  label: string;
  productividad: number;
}

interface UseDashboardChartOptions {
  sucursalId?: string;
  periodo: PeriodoChart;
  refreshMs?: number;
}

function formatFechaCorta(fecha: string): string {
  // fecha viene como "YYYY-MM-DD". Convertir a "DD/MM".
  const [, m, d] = fecha.split("-");
  return `${d}/${m}`;
}

function isPuntoHora(
  p: ProductividadPuntoHora | ProductividadPuntoDia
): p is ProductividadPuntoHora {
  return "hora" in p;
}

export function useDashboardProductividadChart({
  sucursalId,
  periodo,
  refreshMs = 60_000,
}: UseDashboardChartOptions) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [pico, setPico] = useState<{ hora: string; valor: number }>({
    hora: "",
    valor: 0,
  });
  const [promedio, setPromedio] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChart = useCallback(async () => {
    try {
      const params = new URLSearchParams({ periodo });
      if (sucursalId) params.set("sucursalId", sucursalId);
      const res = await apiClient.get<ProductividadChartResponse>(
        `/api/dashboard/productividad-chart?${params}`
      );

      const puntos: ChartPoint[] = res.data.map((p) =>
        isPuntoHora(p)
          ? { label: p.hora, productividad: p.productividad }
          : { label: formatFechaCorta(p.fecha), productividad: p.productividad }
      );

      setData(puntos);
      setPico(res.pico);
      setPromedio(res.promedio);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar gráfico");
    } finally {
      setLoading(false);
    }
  }, [periodo, sucursalId]);

  useEffect(() => {
    setLoading(true);
    fetchChart();
    if (refreshMs <= 0) return;
    const id = setInterval(fetchChart, refreshMs);
    return () => clearInterval(id);
  }, [fetchChart, refreshMs]);

  return { data, pico, promedio, loading, error, refetch: fetchChart };
}
