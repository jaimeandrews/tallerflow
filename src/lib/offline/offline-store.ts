"use client";

import { openDB, type IDBPDatabase, type DBSchema } from "idb";

export type TipoMarcaje = "INICIO" | "FIN" | "PAUSA" | "REANUDACION";

export interface PendingMarcaje {
  idOffline: string;
  actividadId: string;
  ordenTrabajoId?: string;
  tipo: TipoMarcaje;
  horaInicio: string; // ISO
  horaFin?: string; // ISO
  dispositivo?: string;
  notas?: string;
  createdAt: number; // epoch ms
}

export interface CachedActividad {
  id: string;
  nombre: string;
  icono: string | null;
  color: string;
  productiva: boolean;
}

export interface CachedOF {
  id: string;
  numero: string;
  nombre: string;
  cliente: string;
  equipo?: string;
  prioridad?: string;
  estado?: string;
}

export interface LastSyncEntry {
  key: string;
  timestamp: number;
}

interface TallerFlowOfflineDB extends DBSchema {
  pendingMarcajes: {
    key: string; // idOffline
    value: PendingMarcaje;
    indexes: { "by-createdAt": number; "by-horaInicio": string };
  };
  cachedActividades: {
    key: string; // id
    value: CachedActividad;
  };
  cachedOFs: {
    key: string;
    value: CachedOF;
  };
  lastSync: {
    key: string;
    value: LastSyncEntry;
  };
}

const DB_NAME = "tallerflow-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TallerFlowOfflineDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB only available in browser"));
  }
  if (!dbPromise) {
    dbPromise = openDB<TallerFlowOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const pending = db.createObjectStore("pendingMarcajes", { keyPath: "idOffline" });
        pending.createIndex("by-createdAt", "createdAt");
        pending.createIndex("by-horaInicio", "horaInicio");
        db.createObjectStore("cachedActividades", { keyPath: "id" });
        db.createObjectStore("cachedOFs", { keyPath: "id" });
        db.createObjectStore("lastSync", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

// ─── Pending marcajes ────────────────────────────────────────────────────────

export async function addPendingMarcaje(m: Omit<PendingMarcaje, "createdAt">): Promise<void> {
  const db = await getDB();
  await db.put("pendingMarcajes", { ...m, createdAt: Date.now() });
}

export async function getPendingMarcajes(): Promise<PendingMarcaje[]> {
  const db = await getDB();
  // Sort by horaInicio ascending (chronological order for sync)
  return db.getAllFromIndex("pendingMarcajes", "by-horaInicio");
}

export async function countPendingMarcajes(): Promise<number> {
  const db = await getDB();
  return db.count("pendingMarcajes");
}

export async function removePendingMarcaje(idOffline: string): Promise<void> {
  const db = await getDB();
  await db.delete("pendingMarcajes", idOffline);
}

export async function clearPendingMarcajes(): Promise<void> {
  const db = await getDB();
  await db.clear("pendingMarcajes");
}

// ─── Cached actividades ──────────────────────────────────────────────────────

export async function cacheActividades(items: CachedActividad[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("cachedActividades", "readwrite");
  await Promise.all(items.map((i) => tx.store.put(i)));
  await tx.done;
}

export async function getCachedActividades(): Promise<CachedActividad[]> {
  const db = await getDB();
  return db.getAll("cachedActividades");
}

// ─── Cached OFs ──────────────────────────────────────────────────────────────

export async function cacheOFs(items: CachedOF[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("cachedOFs", "readwrite");
  await Promise.all(items.map((i) => tx.store.put(i)));
  await tx.done;
}

export async function getCachedOFs(): Promise<CachedOF[]> {
  const db = await getDB();
  return db.getAll("cachedOFs");
}

// ─── lastSync ────────────────────────────────────────────────────────────────

export async function setLastSync(key: string): Promise<void> {
  const db = await getDB();
  await db.put("lastSync", { key, timestamp: Date.now() });
}

export async function getLastSync(key: string): Promise<number | null> {
  const db = await getDB();
  const entry = await db.get("lastSync", key);
  return entry?.timestamp ?? null;
}
