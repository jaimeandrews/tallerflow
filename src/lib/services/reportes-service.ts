/**
 * Helpers compartidos del módulo de reportes.
 *
 * - Rangos de fecha, cálculo de HH, duración efectiva dentro de un rango
 *   (recorta marcajes abiertos al límite `hasta`).
 * - Generación de tendencia diaria (array de productividad % por día).
 * - Cálculo de días laborales (L–V) en un rango.
 */

// ── Fecha helpers ──────────────────────────────────────────────────────────

export function parseDateUTC(isoDate: string): Date {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  if (isNaN(d.getTime())) throw new Error(`Fecha inválida: ${isoDate}`);
  return d;
}

export function finDelDiaUTC(isoDate: string): Date {
  const d = new Date(`${isoDate}T23:59:59.999Z`);
  return d;
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fechaCorta(isoDate: string, locale = "es-CL"): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function rango(desde: Date, hasta: Date): string[] {
  const fechas: string[] = [];
  const cur = new Date(desde);
  while (cur <= hasta) {
    fechas.push(ymd(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return fechas;
}

/** Días Lunes–Viernes entre dos fechas (inclusive). */
export function diasLaborales(desde: Date, hasta: Date): number {
  let count = 0;
  const cur = new Date(desde);
  while (cur <= hasta) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return Math.max(1, count);
}

// ── Duración efectiva en rango ─────────────────────────────────────────────

/** Horas que un marcaje contribuye dentro del rango [desde, hasta].
 *  Marcajes abiertos se cortan en `hasta`. */
export function horasEnRango(
  horaInicio: Date,
  horaFin: Date | null,
  desdeMs: number,
  hastaMs: number
): number {
  const inicio = Math.max(horaInicio.getTime(), desdeMs);
  const fin = Math.min((horaFin ?? new Date(hastaMs)).getTime(), hastaMs);
  return Math.max(0, (fin - inicio) / 3_600_000);
}

// ── Agrupación por día ─────────────────────────────────────────────────────

type MarcajeMini = {
  horaInicio: Date;
  horaFin: Date | null;
  actividad: { productiva: boolean };
};

export function productivodiadDesde<T extends MarcajeMini>(
  marcajes: T[],
  fechaStr: string,
  hastaMs: number
): number {
  // Periodo = todo ese día UTC
  const diaInicio = new Date(`${fechaStr}T00:00:00.000Z`).getTime();
  const diaFin = Math.min(new Date(`${fechaStr}T23:59:59.999Z`).getTime(), hastaMs);

  let prod = 0;
  let total = 0;
  for (const m of marcajes) {
    const hh = horasEnRango(m.horaInicio, m.horaFin, diaInicio, diaFin);
    total += hh;
    if (m.actividad.productiva) prod += hh;
  }
  return total > 0 ? Math.round((prod / total) * 100) : 0;
}

export function tendencia<T extends MarcajeMini>(
  marcajes: T[],
  fechas: string[],
  hastaMs: number
): number[] {
  return fechas.map((f) => productivodiadDesde(marcajes, f, hastaMs));
}

// ── CSV helper ─────────────────────────────────────────────────────────────

export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Quoted if contains ; , " or newlines
  if (/[;,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(";");
}

// ── Round helper ───────────────────────────────────────────────────────────

export function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function r0(n: number): number {
  return Math.round(n);
}
