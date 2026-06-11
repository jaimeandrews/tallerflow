import type { Actividad, EstadoTecnico, Marcaje, RolUsuario } from "@/generated/prisma";
import { obtenerEstadoTecnico } from "./marcaje-service";

// ── Constants ──────────────────────────────────────────────────────────────

export const HORAS_TURNO_DEFAULT = 8;
export const META_PRODUCTIVIDAD_DEFAULT = 75;
export const UMBRAL_NO_PRODUCTIVAS_PORCENTAJE = 10;
export const HORA_INICIO_TURNO_DEFAULT = 7; // 07:00

// ── Date helpers ───────────────────────────────────────────────────────────

export function inicioDelDia(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function finDelDia(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function ayerMismaHora(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return d;
}

export function diasAtras(days: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Sucursal resolution ────────────────────────────────────────────────────

export function resolverSucursalId(
  rol: RolUsuario,
  userSucursalId: string,
  querySucursalId?: string | null
): string {
  if (rol === "ADMIN" && querySucursalId) return querySucursalId;
  return userSucursalId;
}

// ── HH calculations ────────────────────────────────────────────────────────

type MarcajeConActividad = Pick<Marcaje, "horaInicio" | "horaFin" | "duracionMinutos"> & {
  actividad: Pick<Actividad, "productiva" | "nombre">;
};

export interface HHResumen {
  productivas: number;
  noProductivas: number;
  total: number;
}

// Computes HH consumed by a set of marcajes up to `cutoff`.
// For active marcajes (horaFin === null), uses `cutoff` - horaInicio.
export function calcularHHHastaCorte(
  marcajes: MarcajeConActividad[],
  cutoff: Date = new Date()
): HHResumen {
  let productivas = 0;
  let noProductivas = 0;

  for (const m of marcajes) {
    const inicio = new Date(m.horaInicio).getTime();
    const fin = m.horaFin ? new Date(m.horaFin).getTime() : cutoff.getTime();
    if (fin <= inicio) continue;
    const horas = (fin - inicio) / 3_600_000;
    if (m.actividad.productiva) productivas += horas;
    else noProductivas += horas;
  }

  return {
    productivas,
    noProductivas,
    total: productivas + noProductivas,
  };
}

// ── SLA classification ─────────────────────────────────────────────────────

export type SlaStatus = "ok" | "warning" | "vencida";

export function clasificarSla(
  slaVencimiento: Date | null,
  now: Date = new Date()
): { status: SlaStatus; delta: string | null } {
  if (!slaVencimiento) return { status: "ok", delta: null };

  const ms = new Date(slaVencimiento).getTime() - now.getTime();
  const horas = ms / 3_600_000;

  if (horas < 0) {
    return { status: "vencida", delta: `+${formatHoras(Math.abs(horas))}` };
  }
  if (horas < 4) {
    return { status: "warning", delta: `${formatHoras(horas)} restantes` };
  }
  return { status: "ok", delta: null };
}

function formatHoras(horas: number): string {
  if (horas >= 1) return `${Math.round(horas)}h`;
  const mins = Math.max(1, Math.round(horas * 60));
  return `${mins}m`;
}

// ── Estado técnico ordering ────────────────────────────────────────────────

export const ESTADO_TECNICO_PRIORIDAD: Record<EstadoTecnico, number> = {
  TRABAJANDO: 0,
  PAUSA: 1,
  ALMUERZO: 2,
  DETENIDO: 3,
  DISPONIBLE: 4,
};

// Reuse the existing helper so semantics stay aligned.
export { obtenerEstadoTecnico };

// ── Timeline tone ──────────────────────────────────────────────────────────

export type TimelineTono = "blue" | "green" | "yellow" | "red" | "gray";

interface MarcajeParaTono {
  tipo: "INICIO" | "FIN" | "PAUSA" | "REANUDACION";
  actividad: { nombre: string; productiva: boolean };
}

export function tonoDeMarcaje(m: MarcajeParaTono): TimelineTono {
  if (m.tipo === "FIN") return "green";
  if (m.tipo === "PAUSA") {
    if (m.actividad.nombre === "Espera repuesto") return "red";
    return "yellow";
  }
  if (m.tipo === "INICIO") {
    if (m.actividad.productiva) return "blue";
    if (m.actividad.nombre === "Almuerzo") return "gray";
    return "yellow";
  }
  // REANUDACION
  return "blue";
}
