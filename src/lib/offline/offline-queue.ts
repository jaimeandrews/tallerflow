"use client";

import { addPendingMarcaje, type PendingMarcaje, type TipoMarcaje } from "./offline-store";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // RFC4122 v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface EnqueueArgs {
  actividadId: string;
  ordenTrabajoId?: string;
  tipo: TipoMarcaje;
  horaInicio?: string; // defaults to now
  horaFin?: string;
  notas?: string;
  dispositivo?: string;
}

export async function enqueueMarcaje(args: EnqueueArgs): Promise<PendingMarcaje> {
  const pending: Omit<PendingMarcaje, "createdAt"> = {
    idOffline: uuid(),
    actividadId: args.actividadId,
    ordenTrabajoId: args.ordenTrabajoId,
    tipo: args.tipo,
    horaInicio: args.horaInicio ?? new Date().toISOString(),
    horaFin: args.horaFin,
    notas: args.notas,
    dispositivo: args.dispositivo ?? "kiosco",
  };
  await addPendingMarcaje(pending);
  return { ...pending, createdAt: Date.now() };
}

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}
