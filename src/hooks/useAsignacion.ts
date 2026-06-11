"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AsignarResult,
  AsignadoEnOF,
  OFAsignable,
  PublicarPlanResumen,
  ResumenAsignacion,
  TecnicoConCarga,
} from "@/types/asignacion";

interface ApiTecnicosResponse {
  tecnicos: TecnicoConCarga[];
}
interface ApiOrdenesResponse {
  ordenes: OFAsignable[];
}
interface ApiResumenResponse {
  resumen: ResumenAsignacion;
}

const EMPTY_RESUMEN: ResumenAsignacion = {
  tecnicosAsignados: 0,
  totalTecnicos: 0,
  hhPlanificadas: 0,
  hhDisponibles: 0,
  utilizacion: 0,
  ofSinAsignar: 0,
  sobreCapacidad: 0,
  totalOrdenes: 0,
};

// ── Slot recalculation helper ──────────────────────────────────────────────

function recalcSlots(of: OFAsignable, asignados: AsignadoEnOF[]): OFAsignable {
  return {
    ...of,
    asignados,
    slots: {
      requeridos: of.slots.requeridos,
      asignados: asignados.length,
      faltantes: Math.max(0, of.slots.requeridos - asignados.length),
    },
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAsignacion(sucursalId: string) {
  const [tecnicos, setTecnicos] = useState<TecnicoConCarga[]>([]);
  const [ordenes, setOrdenes] = useState<OFAsignable[]>([]);
  const [resumen, setResumen] = useState<ResumenAsignacion>(EMPTY_RESUMEN);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const qs = sucursalId ? `?sucursalId=${sucursalId}` : "";

  // ── Fetchers ───────────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tecRes, ofRes, resRes] = await Promise.all([
        fetch(`/api/asignacion/tecnicos${qs}`),
        fetch(`/api/asignacion/ordenes-asignables${qs}`),
        fetch(`/api/asignacion/resumen${qs}`),
      ]);
      const [tecData, ofData, resData] = (await Promise.all([
        tecRes.json(),
        ofRes.json(),
        resRes.json(),
      ])) as [ApiTecnicosResponse, ApiOrdenesResponse, ApiResumenResponse];

      setTecnicos(tecData.tecnicos ?? []);
      setOrdenes(ofData.ordenes ?? []);
      setResumen(resData.resumen ?? EMPTY_RESUMEN);
    } catch {
      // errors visible via toast in callers
    } finally {
      setLoading(false);
    }
  }, [qs]);

  // Refresh only tecnicos + resumen (KPI recalculation after assign/unassign)
  const refreshKPIs = useCallback(async () => {
    try {
      const [tecRes, resRes] = await Promise.all([
        fetch(`/api/asignacion/tecnicos${qs}`),
        fetch(`/api/asignacion/resumen${qs}`),
      ]);
      const [tecData, resData] = (await Promise.all([tecRes.json(), resRes.json()])) as [
        ApiTecnicosResponse,
        ApiResumenResponse,
      ];
      setTecnicos(tecData.tecnicos ?? []);
      setResumen(resData.resumen ?? EMPTY_RESUMEN);
    } catch {
      void fetchAll();
    }
  }, [qs, fetchAll]);

  // Refresh only ordenes (conflict recalculation after mover)
  const refreshOrdenes = useCallback(async () => {
    try {
      const res = await fetch(`/api/asignacion/ordenes-asignables${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as ApiOrdenesResponse;
      setOrdenes(data.ordenes ?? []);
    } catch {
      // fallback silently
    }
  }, [qs]);

  useEffect(() => {
    const id = setTimeout(() => void fetchAll(), 0);
    return () => clearTimeout(id);
  }, [fetchAll]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  /**
   * Assign a technician to a work order.
   * True optimistic update: UI updates before API responds.
   * On error: full refresh restores server state.
   */
  const asignar = useCallback(
    async (
      tecnicoId: string,
      ordenTrabajoId: string,
      hhPlanificadas?: number
    ): Promise<AsignarResult> => {
      const tecnico = tecnicos.find((t) => t.id === tecnicoId);
      if (!tecnico) return { ok: false, error: "Técnico no encontrado", warnings: [] };

      // ── 1. Apply optimistic update immediately ──
      const optimisticAsignado: AsignadoEnOF = {
        asignacionId: `optimistic_${Date.now()}`,
        hhPlanificadas: hhPlanificadas ?? 0,
        usuario: {
          id: tecnico.id,
          nombre: tecnico.nombre,
          apellido: tecnico.apellido,
          iniciales: tecnico.iniciales,
          color: tecnico.color,
        },
      };
      setOrdenes((prev) =>
        prev.map((of) => {
          if (of.id !== ordenTrabajoId) return of;
          if (of.asignados.some((a) => a.usuario.id === tecnicoId)) return of;
          return recalcSlots(of, [...of.asignados, optimisticAsignado]);
        })
      );

      // ── 2. Call API ──
      setMutating(true);
      try {
        const res = await fetch("/api/asignacion/asignar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tecnicoId, ordenTrabajoId, hhPlanificadas }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          warnings?: AsignarResult["warnings"];
          asignacion?: { hhPlanificadas: number };
        };

        if (!res.ok) {
          // ── 3a. Revert on failure ──
          void fetchAll();
          return { ok: false, error: data.error ?? `Error ${res.status}`, warnings: [] };
        }

        // ── 3b. Confirm: fix optimistic asignacionId + hhPlanificadas from server ──
        const serverHH = data.asignacion?.hhPlanificadas ?? hhPlanificadas ?? 0;
        setOrdenes((prev) =>
          prev.map((of) => {
            if (of.id !== ordenTrabajoId) return of;
            const updated = of.asignados.map((a) =>
              a.asignacionId.startsWith("optimistic_") && a.usuario.id === tecnicoId
                ? {
                    ...a,
                    asignacionId: data.asignacion?.hhPlanificadas ? a.asignacionId : a.asignacionId,
                    hhPlanificadas: serverHH,
                  }
                : a
            );
            return recalcSlots(of, updated);
          })
        );
        setIsDirty(true);
        void refreshKPIs();
        return { ok: true, warnings: data.warnings ?? [] };
      } finally {
        setMutating(false);
      }
    },
    [tecnicos, refreshKPIs, fetchAll]
  );

  /**
   * Unassign a technician from a work order.
   * True optimistic: removes chip immediately, reverts on failure.
   */
  const desasignar = useCallback(
    async (tecnicoId: string, ordenTrabajoId: string): Promise<AsignarResult> => {
      // ── 1. Apply optimistic update ──
      setOrdenes((prev) =>
        prev.map((of) => {
          if (of.id !== ordenTrabajoId) return of;
          return recalcSlots(
            of,
            of.asignados.filter((a) => a.usuario.id !== tecnicoId)
          );
        })
      );

      // ── 2. Call API ──
      setMutating(true);
      try {
        const res = await fetch("/api/asignacion/desasignar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tecnicoId, ordenTrabajoId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          warnings?: AsignarResult["warnings"];
        };

        if (!res.ok) {
          void fetchAll(); // revert
          return { ok: false, error: data.error ?? `Error ${res.status}`, warnings: [] };
        }

        setIsDirty(true);
        void refreshKPIs();
        return { ok: true, warnings: data.warnings ?? [] };
      } finally {
        setMutating(false);
      }
    },
    [refreshKPIs, fetchAll]
  );

  /**
   * Move a technician from one work order to another.
   * Optimistic update on both OFs; after API success refreshes ordenes for
   * accurate conflict recalculation on both cards.
   */
  const mover = useCallback(
    async (
      tecnicoId: string,
      desdeOrdenId: string,
      haciaOrdenId: string
    ): Promise<AsignarResult> => {
      // Find the existing asignado record to preserve its data
      const origenOf = ordenes.find((o) => o.id === desdeOrdenId);
      const asignadoOrigen = origenOf?.asignados.find((a) => a.usuario.id === tecnicoId);

      // ── 1. Apply optimistic update on both OFs ──
      setOrdenes((prev) =>
        prev.map((of) => {
          if (of.id === desdeOrdenId) {
            return recalcSlots(
              of,
              of.asignados.filter((a) => a.usuario.id !== tecnicoId)
            );
          }
          if (of.id === haciaOrdenId && asignadoOrigen) {
            if (of.asignados.some((a) => a.usuario.id === tecnicoId)) return of;
            return recalcSlots(of, [...of.asignados, asignadoOrigen]);
          }
          return of;
        })
      );

      // ── 2. Call API ──
      setMutating(true);
      try {
        const res = await fetch("/api/asignacion/mover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tecnicoId, desdeOrdenId, haciaOrdenId }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };

        if (!res.ok) {
          void fetchAll(); // revert
          return { ok: false, error: data.error ?? `Error ${res.status}`, warnings: [] };
        }

        setIsDirty(true);
        // Refresh KPIs and ordenes in parallel for accurate conflict state on both OFs
        void Promise.all([refreshKPIs(), refreshOrdenes()]);
        return { ok: true, warnings: [] };
      } finally {
        setMutating(false);
      }
    },
    [ordenes, refreshKPIs, refreshOrdenes, fetchAll]
  );

  const publicarPlan = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
    resumen?: PublicarPlanResumen;
  }> => {
    setMutating(true);
    try {
      const res = await fetch("/api/asignacion/publicar-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sucursalId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        resumen?: PublicarPlanResumen;
      };
      if (!res.ok) return { ok: false, error: data.error ?? `Error ${res.status}` };
      setIsDirty(false);
      return { ok: true, resumen: data.resumen };
    } finally {
      setMutating(false);
    }
  }, [sucursalId]);

  const resetChanges = useCallback(() => {
    setIsDirty(false);
    void fetchAll();
  }, [fetchAll]);

  return {
    tecnicos,
    ordenes,
    resumen,
    loading,
    mutating,
    isDirty,
    asignar,
    desasignar,
    mover,
    publicarPlan,
    resetChanges,
    refetch: fetchAll,
  };
}
