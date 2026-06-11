"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

// ── Result types ───────────────────────────────────────────────────────────────

export interface MutateOk<T = unknown> {
  ok: true;
  data: T;
  warnings?: string[];
}

export interface MutateErr {
  ok: false;
  error: string;
}

export type MutateResult<T = unknown> = MutateOk<T> | MutateErr;

// ── Options ────────────────────────────────────────────────────────────────────

export interface UseConfiguracionOptions {
  /** Base API endpoint, e.g. "/api/configuracion/turnos" */
  endpoint: string;
  /**
   * Query params appended to every GET.
   * Caller should memoize this object (useMemo) to avoid excessive refetches.
   * Pass null/undefined to skip.
   */
  queryParams?: Record<string, string | number | boolean | undefined | null>;
  /**
   * Sub-path for PATCH toggle, relative to the item URL.
   * Defaults to "toggle-activa". Use "toggle-activo" where the field is named `activo`.
   */
  toggleSuffix?: string;
  messages?: {
    fetchError?: string;
    createSuccess?: string;
    updateSuccess?: string;
    toggleOnSuccess?: string;
    toggleOffSuccess?: string;
    deleteSuccess?: string;
  };
}

// ── Return type ────────────────────────────────────────────────────────────────

export interface UseConfiguracionReturn<T> {
  /** Current list of items */
  data: T[];
  /** Total items reported by the API (for pagination-aware consumers) */
  total: number;
  /** True while the GET is in flight */
  loading: boolean;
  /** Set when the GET fails */
  error: string | null;
  /** Manually re-run the GET */
  refetch: () => Promise<void>;

  /** POST /endpoint — returns the created item on success */
  create: (body: unknown) => Promise<MutateResult<T>>;
  /** PUT /endpoint/:id — returns the updated item on success */
  update: (id: string, body: unknown) => Promise<MutateResult<T>>;
  /** PATCH /endpoint/:id/:toggleSuffix — toggles active/inactive */
  toggleActive: (id: string) => Promise<MutateResult>;
  /** DELETE /endpoint/:id */
  remove: (id: string) => Promise<MutateResult>;

  /** True while a POST is in flight */
  creating: boolean;
  /** ID of the item being PUTted, or null */
  updatingId: string | null;
  /** ID of the item being PATCHed, or null */
  togglingId: string | null;
  /** ID of the item being DELETEd, or null */
  deletingId: string | null;
  /** True if any mutation is in flight */
  isMutating: boolean;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useConfiguracion<T = unknown>({
  endpoint,
  queryParams,
  toggleSuffix = "toggle-activa",
  messages = {},
}: UseConfiguracionOptions): UseConfiguracionReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Serialize params to a stable primitive for dependency tracking.
  // The caller is responsible for memoizing the queryParams object.
  const paramsJson = JSON.stringify(queryParams ?? null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = JSON.parse(paramsJson) as Record<string, unknown> | null;
      const sp = new URLSearchParams();
      if (p) {
        for (const [k, v] of Object.entries(p)) {
          if (v !== undefined && v !== null && v !== "") {
            sp.set(k, String(v));
          }
        }
      }
      const url = sp.toString() ? `${endpoint}?${sp}` : endpoint;
      const res = await fetch(url);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? (json.data as unknown[])?.length ?? 0);
    } catch (err) {
      const msg =
        err instanceof Error && err.message
          ? err.message
          : (messages.fetchError ?? "Error cargando datos");
      setError(msg);
    } finally {
      setLoading(false);
    }
    // paramsJson is a serialized string, safe in deps
     
  }, [endpoint, paramsJson, messages.fetchError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Shared response handler ────────────────────────────────────────────────

  function extractCreated(json: Record<string, unknown>): T {
    // Most endpoints return { turno: {...} } or { usuario: {...} } etc.
    const val = Object.values(json).find((v) => v && typeof v === "object" && !Array.isArray(v));
    return (val ?? json) as T;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  const create = useCallback(
    async (body: unknown): Promise<MutateResult<T>> => {
      setCreating(true);
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json: Record<string, unknown> = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (json.error as string) ?? "Error al crear";
          toast.error(msg);
          return { ok: false, error: msg };
        }
        toast.success(messages.createSuccess ?? "Creado correctamente");
        await fetchData();
        return {
          ok: true,
          data: extractCreated(json),
          warnings: (json.warnings as string[] | undefined) ?? [],
        };
      } catch {
        const msg = "Error de conexión";
        toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        setCreating(false);
      }
    },
    [endpoint, messages.createSuccess, fetchData]
  );

  // ── Update ─────────────────────────────────────────────────────────────────

  const update = useCallback(
    async (id: string, body: unknown): Promise<MutateResult<T>> => {
      setUpdatingId(id);
      try {
        const res = await fetch(`${endpoint}/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json: Record<string, unknown> = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (json.error as string) ?? "Error al actualizar";
          toast.error(msg);
          return { ok: false, error: msg };
        }
        toast.success(messages.updateSuccess ?? "Actualizado correctamente");
        await fetchData();
        return {
          ok: true,
          data: extractCreated(json),
          warnings: (json.warnings as string[] | undefined) ?? [],
        };
      } catch {
        const msg = "Error de conexión";
        toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        setUpdatingId(null);
      }
    },
    [endpoint, messages.updateSuccess, fetchData]
  );

  // ── Toggle active ──────────────────────────────────────────────────────────

  const toggleActive = useCallback(
    async (id: string): Promise<MutateResult> => {
      setTogglingId(id);
      try {
        const res = await fetch(`${endpoint}/${id}/${toggleSuffix}`, {
          method: "PATCH",
        });
        const json: Record<string, unknown> = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (json.error as string) ?? "Error cambiando estado";
          toast.error(msg);
          return { ok: false, error: msg };
        }
        // Detect new state from response: activa / activo / status
        const isNowActive =
          json.activa !== undefined
            ? !!json.activa
            : json.activo !== undefined
              ? !!json.activo
              : true;
        const msg = isNowActive
          ? (messages.toggleOnSuccess ?? "Activado")
          : (messages.toggleOffSuccess ?? "Desactivado");
        toast.success(msg);
        await fetchData();
        return { ok: true, data: json };
      } catch {
        const msg = "Error de conexión";
        toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        setTogglingId(null);
      }
    },
    [endpoint, toggleSuffix, messages.toggleOnSuccess, messages.toggleOffSuccess, fetchData]
  );

  // ── Delete ─────────────────────────────────────────────────────────────────

  const remove = useCallback(
    async (id: string): Promise<MutateResult> => {
      setDeletingId(id);
      try {
        const res = await fetch(`${endpoint}/${id}`, {
          method: "DELETE",
        });
        const json: Record<string, unknown> = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = (json.error as string) ?? "Error al eliminar";
          toast.error(msg);
          return { ok: false, error: msg };
        }
        toast.success(messages.deleteSuccess ?? "Eliminado correctamente");
        await fetchData();
        return { ok: true, data: json };
      } catch {
        const msg = "Error de conexión";
        toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        setDeletingId(null);
      }
    },
    [endpoint, messages.deleteSuccess, fetchData]
  );

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    data,
    total,
    loading,
    error,
    refetch: fetchData,
    create,
    update,
    toggleActive,
    remove,
    creating,
    updatingId,
    togglingId,
    deletingId,
    isMutating: creating || !!updatingId || !!togglingId || !!deletingId,
  };
}
