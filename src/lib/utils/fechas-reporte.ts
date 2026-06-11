/**
 * Calcula los rangos de fecha para los periodos rápidos del módulo de reportes.
 * Todas las fechas son locales (sin forzar UTC) ya que el usuario final las ve
 * en su zona horaria.
 */

import type { PeriodoRapido } from "@/types/reportes-ui";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function addMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() + n);
  return result;
}

function startOfWeek(d: Date): Date {
  const result = new Date(d);
  const dow = result.getDay(); // 0=Sunday, 1=Monday…
  const diff = dow === 0 ? -6 : 1 - dow; // Monday as first day
  result.setDate(result.getDate() + diff);
  return result;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function calcularRango(periodo: PeriodoRapido): {
  desde: string;
  hasta: string;
} {
  const hoy = new Date();
  switch (periodo) {
    case "hoy":
      return { desde: isoDate(hoy), hasta: isoDate(hoy) };
    case "semana":
      return { desde: isoDate(startOfWeek(hoy)), hasta: isoDate(hoy) };
    case "mes":
      return { desde: isoDate(startOfMonth(hoy)), hasta: isoDate(hoy) };
    case "trimestre":
      return { desde: isoDate(addMonths(hoy, -3)), hasta: isoDate(hoy) };
    default:
      return { desde: isoDate(addDays(hoy, -30)), hasta: isoDate(hoy) };
  }
}

export function hoyISO(): string {
  return isoDate(new Date());
}
