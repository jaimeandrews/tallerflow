"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EstadoOF } from "@/generated/prisma";
import type {
  ActualizarOFPayload,
  CrearOFPayload,
  FiltrosOrdenes,
  ListadoOrdenesResponse,
  OrdenTrabajoListItem,
  StatsOrdenes,
  StatsOrdenesResponse,
} from "@/types/ordenes";

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_FILTROS: FiltrosOrdenes = {
  pagina: 1,
  porPagina: 50,
  ordenarPor: "numero",
  direccion: "asc",
};

const EMPTY_STATS: StatsOrdenes = {
  pendientes: 0,
  enProceso: 0,
  pausadas: 0,
  esperaRepuesto: 0,
  finalizadas: 0,
  criticas: 0,
  total: 0,
};

// ── Query builder ──────────────────────────────────────────────────────────

function buildQuery(filtros: FiltrosOrdenes): string {
  const p = new URLSearchParams();
  if (filtros.estado) p.set("estado", filtros.estado);
  if (filtros.prioridad) p.set("prioridad", filtros.prioridad);
  if (filtros.sucursalId) p.set("sucursalId", filtros.sucursalId);
  if (filtros.tecnicoId) p.set("tecnicoId", filtros.tecnicoId);
  if (filtros.busqueda) p.set("busqueda", filtros.busqueda);
  p.set("pagina", String(filtros.pagina));
  p.set("porPagina", String(filtros.porPagina));
  p.set("ordenarPor", filtros.ordenarPor);
  p.set("direccion", filtros.direccion);
  return p.toString();
}

// ── Mutation result ────────────────────────────────────────────────────────

export interface MutationResult {
  ok: boolean;
  error?: string;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useOrdenes(initial?: Partial<FiltrosOrdenes>) {
  // ── Filter + UI state ────────────────────────────────────────────────────
  const [filtros, setFiltrosState] = useState<FiltrosOrdenes>({
    ...DEFAULT_FILTROS,
    ...initial,
  });
  const [busquedaInput, setBusquedaInput] = useState(initial?.busqueda ?? "");
  const [vista, setVista] = useState<"tabla" | "kanban">("tabla");

  // ── Data state ───────────────────────────────────────────────────────────
  const [data, setData] = useState<OrdenTrabajoListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [stats, setStats] = useState<StatsOrdenes>(EMPTY_STATS);

  // ── Loading / error state ────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Debounce: busquedaInput → filtros.busqueda (300 ms) ──────────────────
  useEffect(() => {
    const id = setTimeout(() => {
      setFiltrosState((prev) => {
        const next = busquedaInput.trim() || undefined;
        if (prev.busqueda === next) return prev;
        return { ...prev, busqueda: next, pagina: 1 };
      });
    }, 300);
    return () => clearTimeout(id);
  }, [busquedaInput]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const query = useMemo(() => buildQuery(filtros), [filtros]);

  const fetchOrdenes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ordenes?${query}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = (await res.json()) as ListadoOrdenesResponse;
      setData(json.data);
      setTotal(json.total);
      setTotalPaginas(json.totalPaginas);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar órdenes";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const qs = filtros.sucursalId ? `?sucursalId=${filtros.sucursalId}` : "";
      const res = await fetch(`/api/ordenes/stats${qs}`);
      if (!res.ok) return;
      const json = (await res.json()) as StatsOrdenesResponse;
      setStats(json.stats);
    } catch {
      // non-critical — keep previous stats
    } finally {
      setStatsLoading(false);
    }
  }, [filtros.sucursalId]);

  useEffect(() => {
    const id = setTimeout(() => void fetchOrdenes(), 0);
    return () => clearTimeout(id);
  }, [fetchOrdenes]);

  useEffect(() => {
    const id = setTimeout(() => void fetchStats(), 0);
    return () => clearTimeout(id);
  }, [fetchStats]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const crearOrden = useCallback(
    async (payload: CrearOFPayload): Promise<MutationResult> => {
      setMutating(true);
      try {
        const res = await fetch("/api/ordenes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return { ok: false, error: json.error ?? `Error ${res.status}` };
        await Promise.all([fetchOrdenes(), fetchStats()]);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Error de red" };
      } finally {
        setMutating(false);
      }
    },
    [fetchOrdenes, fetchStats]
  );

  const actualizarOrden = useCallback(
    async (id: string, payload: ActualizarOFPayload): Promise<MutationResult> => {
      setMutating(true);
      try {
        const res = await fetch(`/api/ordenes/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return { ok: false, error: json.error ?? `Error ${res.status}` };
        await fetchOrdenes();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Error de red" };
      } finally {
        setMutating(false);
      }
    },
    [fetchOrdenes]
  );

  const cambiarEstado = useCallback(
    async (id: string, estado: EstadoOF): Promise<MutationResult> => {
      setMutating(true);
      try {
        const res = await fetch(`/api/ordenes/${id}/estado`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return { ok: false, error: json.error ?? `Error ${res.status}` };
        await Promise.all([fetchOrdenes(), fetchStats()]);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Error de red" };
      } finally {
        setMutating(false);
      }
    },
    [fetchOrdenes, fetchStats]
  );

  // ── Filter helpers ────────────────────────────────────────────────────────

  const setFiltros = useCallback((updates: Partial<FiltrosOrdenes>) => {
    setFiltrosState((prev) => {
      const next = { ...prev, ...updates };
      if (!("pagina" in updates) && next.pagina > 1) next.pagina = 1;
      return next;
    });
  }, []);

  const resetFiltros = useCallback(() => {
    setBusquedaInput("");
    setFiltrosState({ ...DEFAULT_FILTROS, ...initial });
  }, [initial]);

  // ── Return ────────────────────────────────────────────────────────────────

  return {
    // Filter / UI
    filtros,
    setFiltros,
    resetFiltros,
    busquedaInput,
    setBusquedaInput,
    vista,
    setVista,
    // Data
    data,
    total,
    totalPaginas,
    stats,
    // Loading
    loading,
    statsLoading,
    mutating,
    error,
    // Explicit refetch (for external triggers like dialog onSuccess)
    refetch: fetchOrdenes,
    refetchStats: fetchStats,
    // Mutations
    crearOrden,
    actualizarOrden,
    cambiarEstado,
  };
}
