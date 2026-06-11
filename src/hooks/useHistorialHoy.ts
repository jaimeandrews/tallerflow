"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { MarcajeHistorial, ResumenHH } from "@/types/marcaje";

interface HistorialResponse {
  marcajes: MarcajeHistorial[];
  resumen: ResumenHH;
}

export function useHistorialHoy(token?: string) {
  const [marcajes, setMarcajes] = useState<MarcajeHistorial[]>([]);
  const [totales, setTotales] = useState<ResumenHH>({ productivas: 0, noProductivas: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await apiClient.get<HistorialResponse>("/api/marcaje/historial-hoy", token);
      setMarcajes(data.marcajes);
      setTotales(data.resumen);
    } catch {
      // error already toasted by apiClient
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const id = setTimeout(() => void refetch(), 0);
    return () => clearTimeout(id);
  }, [refetch]);

  return { marcajes, totales, loading, refetch };
}
