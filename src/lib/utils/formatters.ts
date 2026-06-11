import { format, formatDuration, intervalToDuration } from "date-fns";
import { es } from "date-fns/locale";

export function formatTime(date: Date | string): string {
  return format(new Date(date), "HH:mm");
}

export function formatTimeSeconds(date: Date | string): string {
  return format(new Date(date), "HH:mm:ss");
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), "dd/MM/yyyy", { locale: es });
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: es });
}

export function formatMinutesToText(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatMinutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDurationFromSeconds(seconds: number): string {
  const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
  const parts: string[] = [];
  if (duration.hours) parts.push(`${duration.hours}h`);
  if (duration.minutes) parts.push(`${duration.minutes}m`);
  if (duration.seconds !== undefined && parts.length === 0) parts.push(`${duration.seconds}s`);
  return parts.join(" ") || "0s";
}

export function formatHorasHombre(hh: number): string {
  return `${hh.toFixed(1)} HH`;
}

export function formatRut(rut: string): string {
  const clean = rut.replace(/[^0-9kK]/g, "");
  if (clean.length < 2) return rut;
  const dv = clean.slice(-1);
  const num = clean.slice(0, -1);
  const formatted = num.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv.toUpperCase()}`;
}
