import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { calcularDuracionMinutos } from "@/lib/services/marcaje-service";

const schema = z.object({
  actividadId: z.string().uuid(),
  ordenTrabajoId: z.string().uuid().optional(),
});

const MARCAJE_SELECT = {
  id: true,
  tipo: true,
  horaInicio: true,
  horaFin: true,
  duracionMinutos: true,
  notas: true,
  actividad: {
    select: { id: true, nombre: true, color: true, icono: true, productiva: true },
  },
  ordenTrabajo: {
    select: { id: true, numero: true, nombre: true, cliente: true },
  },
} as const;

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { actividadId, ordenTrabajoId } = parsed.data;

  const actividad = await prisma.actividad.findFirst({
    where: {
      id: actividadId,
      activa: true,
      OR: [{ sucursalId: null }, { sucursalId: user.sucursalId }],
    },
  });
  if (!actividad) {
    return Response.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  // Verify OF (if provided) belongs to user's sucursal and is not finalized
  if (ordenTrabajoId) {
    const of = await prisma.ordenTrabajo.findFirst({
      where: { id: ordenTrabajoId, sucursalId: user.sucursalId },
    });
    if (!of) {
      return Response.json({ error: "Orden de trabajo no encontrada" }, { status: 404 });
    }
    if (of.estado === "FINALIZADA") {
      return Response.json({ error: "La OF está finalizada" }, { status: 400 });
    }
  }

  const now = new Date();

  const marcajeActivo = await prisma.marcaje.findFirst({
    where: { usuarioId: user.id, horaFin: null },
    orderBy: { horaInicio: "desc" },
  });

  if (marcajeActivo) {
    const duracion = calcularDuracionMinutos(marcajeActivo.horaInicio, now);
    await prisma.marcaje.update({
      where: { id: marcajeActivo.id },
      data: { horaFin: now, duracionMinutos: duracion },
    });
  }

  const turno = await prisma.turno.findFirst({
    where: { sucursalId: user.sucursalId, activo: true },
  });

  const marcaje = await prisma.marcaje.create({
    data: {
      usuarioId: user.id,
      actividadId,
      ordenTrabajoId: ordenTrabajoId ?? marcajeActivo?.ordenTrabajoId ?? null,
      tipo: "INICIO",
      horaInicio: now,
      sucursalId: user.sucursalId,
      turnoId: turno?.id ?? null,
    },
    select: MARCAJE_SELECT,
  });

  return Response.json({ marcaje }, { status: 201 });
}
