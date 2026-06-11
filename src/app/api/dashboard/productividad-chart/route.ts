import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  HORA_INICIO_TURNO_DEFAULT,
  diasAtras,
  inicioDelDia,
  resolverSucursalId,
} from "@/lib/services/dashboard-service";

const chartQuerySchema = z.object({
  sucursalId: z.uuid().optional(),
  periodo: z.enum(["hoy", "7d", "30d"]).default("hoy"),
});

interface MarcajeChart {
  horaInicio: Date;
  horaFin: Date | null;
  actividad: { productiva: boolean };
}

interface PuntoHora {
  hora: string;
  productividad: number;
}

interface PuntoDia {
  fecha: string;
  productividad: number;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = chartQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sucursalId = resolverSucursalId(user.rol, user.sucursalId, parsed.data.sucursalId);
  const { periodo } = parsed.data;

  const ahora = new Date();
  let desde: Date;
  if (periodo === "hoy") desde = inicioDelDia(ahora);
  else if (periodo === "7d") desde = diasAtras(6, ahora);
  else desde = diasAtras(29, ahora);

  const marcajes = await prisma.marcaje.findMany({
    where: {
      sucursalId,
      horaInicio: { gte: desde, lte: ahora },
    },
    select: {
      horaInicio: true,
      horaFin: true,
      actividad: { select: { productiva: true } },
    },
  });

  if (periodo === "hoy") {
    const puntos = construirPuntosPorHora(marcajes, ahora);
    return Response.json({
      data: puntos,
      ...resumen(puntos.map((p) => ({ etiqueta: p.hora, valor: p.productividad }))),
    });
  }

  const dias = periodo === "7d" ? 7 : 30;
  const puntos = construirPuntosPorDia(marcajes, ahora, dias);
  return Response.json({
    data: puntos,
    ...resumen(puntos.map((p) => ({ etiqueta: p.fecha, valor: p.productividad }))),
  });
}

function construirPuntosPorHora(marcajes: MarcajeChart[], ahora: Date): PuntoHora[] {
  const horaActual = ahora.getHours();
  const horaInicioTurno = Math.min(
    HORA_INICIO_TURNO_DEFAULT,
    marcajes.length > 0
      ? Math.min(...marcajes.map((m) => new Date(m.horaInicio).getHours()))
      : HORA_INICIO_TURNO_DEFAULT
  );

  type Bucket = { productivas: number; total: number };
  const buckets = new Map<number, Bucket>();

  for (let h = horaInicioTurno; h <= horaActual; h++) {
    buckets.set(h, { productivas: 0, total: 0 });
  }

  for (const m of marcajes) {
    const inicio = new Date(m.horaInicio);
    const fin = m.horaFin ? new Date(m.horaFin) : ahora;
    const hora = inicio.getHours();
    if (!buckets.has(hora)) buckets.set(hora, { productivas: 0, total: 0 });
    const horas = Math.max(0, (fin.getTime() - inicio.getTime()) / 3_600_000);
    const bucket = buckets.get(hora)!;
    bucket.total += horas;
    if (m.actividad.productiva) bucket.productivas += horas;
  }

  const puntos: PuntoHora[] = [];
  const horasOrdenadas = [...buckets.keys()].sort((a, b) => a - b);
  for (const h of horasOrdenadas) {
    const b = buckets.get(h)!;
    const productividad = b.total > 0 ? Math.round((b.productivas / b.total) * 100) : 0;
    puntos.push({ hora: `${String(h).padStart(2, "0")}h`, productividad });
  }

  return puntos;
}

function construirPuntosPorDia(marcajes: MarcajeChart[], ahora: Date, dias: number): PuntoDia[] {
  type Bucket = { productivas: number; total: number };
  const buckets = new Map<string, Bucket>();

  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(ahora);
    d.setDate(d.getDate() - i);
    buckets.set(claveFecha(d), { productivas: 0, total: 0 });
  }

  for (const m of marcajes) {
    const inicio = new Date(m.horaInicio);
    const fin = m.horaFin ? new Date(m.horaFin) : ahora;
    const clave = claveFecha(inicio);
    if (!buckets.has(clave)) continue;
    const horas = Math.max(0, (fin.getTime() - inicio.getTime()) / 3_600_000);
    const bucket = buckets.get(clave)!;
    bucket.total += horas;
    if (m.actividad.productiva) bucket.productivas += horas;
  }

  const puntos: PuntoDia[] = [];
  for (const [fecha, b] of buckets) {
    const productividad = b.total > 0 ? Math.round((b.productivas / b.total) * 100) : 0;
    puntos.push({ fecha, productividad });
  }

  return puntos;
}

function claveFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resumen(puntos: Array<{ etiqueta: string; valor: number }>): {
  pico: { hora: string; valor: number };
  promedio: number;
} {
  if (puntos.length === 0) {
    return { pico: { hora: "", valor: 0 }, promedio: 0 };
  }
  let pico = puntos[0];
  let suma = 0;
  for (const p of puntos) {
    if (p.valor > pico.valor) pico = p;
    suma += p.valor;
  }
  return {
    pico: { hora: pico.etiqueta, valor: pico.valor },
    promedio: Math.round(suma / puntos.length),
  };
}
