/**
 * Retorna los marcajes de una OF en un rango de fechas para el timeline
 * del detalle en el módulo de reportes.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { finDelDiaUTC, parseDateUTC } from "@/lib/services/reportes-service";
import type { TipoMarcaje } from "@/generated/prisma";

const querySchema = z.object({
  ofId: z.string().uuid(),
  desde: z.iso.date(),
  hasta: z.iso.date(),
});

function clasificarTipo(tipo: TipoMarcaje, actividadNombre: string) {
  if (tipo === "PAUSA") return { tipo: "pausa", color: "#F4A91A" };
  if (actividadNombre === "Espera repuesto") return { tipo: "detenido", color: "#E82C2C" };
  if (actividadNombre === "Almuerzo") return { tipo: "almuerzo", color: "#00AEEF" };
  return { tipo: "trabajo", color: "#22C55E" };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { ofId, desde, hasta } = parsed.data;
  const desdeDate = parseDateUTC(desde);
  const hastaDate = finDelDiaUTC(hasta);

  // Verificar que la OF pertenece a la sucursal del usuario (excepto ADMIN)
  const of = await prisma.ordenTrabajo.findFirst({
    where: {
      id: ofId,
      ...(user.rol !== "ADMIN" ? { sucursalId: user.sucursalId } : {}),
    },
    select: { id: true, numero: true },
  });
  if (!of) {
    return Response.json({ error: "OF no encontrada" }, { status: 404 });
  }

  const marcajes = await prisma.marcaje.findMany({
    where: {
      ordenTrabajoId: ofId,
      horaInicio: { gte: desdeDate, lte: hastaDate },
    },
    orderBy: { horaInicio: "asc" },
    select: {
      id: true,
      tipo: true,
      horaInicio: true,
      horaFin: true,
      duracionMinutos: true,
      actividad: { select: { nombre: true, productiva: true } },
      usuario: { select: { id: true, nombre: true, apellido: true, iniciales: true, color: true } },
    },
  });

  const ahora = hastaDate.getTime();

  const segments = marcajes.map((m) => {
    const { tipo: segTipo, color } = clasificarTipo(m.tipo, m.actividad.nombre);
    const fin = m.horaFin ?? new Date(Math.min(ahora, Date.now()));
    return {
      id: m.id,
      tipo: segTipo,
      color,
      actividad: m.actividad.nombre,
      inicio: m.horaInicio.toISOString(),
      fin: fin.toISOString(),
      duracionMinutos:
        m.duracionMinutos ?? Math.floor((fin.getTime() - m.horaInicio.getTime()) / 60_000),
      tecnico: {
        id: m.usuario.id,
        nombre: `${m.usuario.nombre} ${m.usuario.apellido}`.trim(),
        iniciales: m.usuario.iniciales,
        color: m.usuario.color,
      },
    };
  });

  return Response.json({ segments, of });
}
