"use client";

import { toast } from "sonner";
import { getPendingMarcajes, removePendingMarcaje, setLastSync } from "./offline-store";

export interface SyncResult {
  sincronizados: number;
  duplicados: number;
  errores: string[];
}

interface SyncOptions {
  token?: string;
  silent?: boolean;
}

let syncing = false;
const listeners = new Set<(state: "idle" | "syncing" | "success") => void>();

export function onSyncStateChange(cb: (state: "idle" | "syncing" | "success") => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(state: "idle" | "syncing" | "success") {
  for (const cb of listeners) cb(state);
}

export async function syncPending(opts: SyncOptions = {}): Promise<SyncResult | null> {
  if (syncing) return null;

  const pending = await getPendingMarcajes();
  if (pending.length === 0) return null;

  syncing = true;
  emit("syncing");

  try {
    // Send to /api/marcaje/sync-offline (already sorted by horaInicio ASC)
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

    const res = await fetch("/api/marcaje/sync-offline", {
      method: "POST",
      headers,
      body: JSON.stringify({
        marcajes: pending.map((p) => ({
          idOffline: p.idOffline,
          actividadId: p.actividadId,
          ordenTrabajoId: p.ordenTrabajoId,
          tipo: p.tipo,
          horaInicio: p.horaInicio,
          horaFin: p.horaFin,
          dispositivo: p.dispositivo,
          notas: p.notas,
        })),
      }),
    });

    if (!res.ok) {
      throw new Error(`Sync failed: ${res.status}`);
    }

    const result = (await res.json()) as SyncResult;

    // Remove only successfully synced + duplicates (already in DB).
    // Items that errored (e.g. solapamiento) stay in the queue for manual review.
    const erroredIds = new Set<string>();
    for (const err of result.errores) {
      const match = err.match(/[a-f0-9-]{8,}/i);
      if (match) erroredIds.add(match[0]);
    }

    for (const p of pending) {
      if (!erroredIds.has(p.idOffline)) {
        await removePendingMarcaje(p.idOffline);
      }
    }

    await setLastSync("marcajes");

    if (!opts.silent) {
      if (result.sincronizados > 0) {
        toast.success(
          `✓ ${result.sincronizados} marcaje${result.sincronizados !== 1 ? "s" : ""} sincronizado${result.sincronizados !== 1 ? "s" : ""}`
        );
      }
      if (result.errores.length > 0) {
        toast.warning(
          `${result.errores.length} marcaje${result.errores.length !== 1 ? "s" : ""} con conflicto — revisar`
        );
      }
    }

    emit("success");
    setTimeout(() => emit("idle"), 3000);
    return result;
  } catch (err) {
    emit("idle");
    if (!opts.silent) {
      toast.error("Error al sincronizar — reintentaremos al recuperar conexión");
    }
    console.error("[offline-sync]", err);
    return null;
  } finally {
    syncing = false;
  }
}

export function startAutoSync(getToken: () => string | undefined) {
  if (typeof window === "undefined") return () => {};

  const handler = () => void syncPending({ token: getToken(), silent: false });

  window.addEventListener("online", handler);
  // Sync on app open if there are pendings and we're online
  if (navigator.onLine) {
    setTimeout(handler, 1000);
  }

  return () => window.removeEventListener("online", handler);
}
