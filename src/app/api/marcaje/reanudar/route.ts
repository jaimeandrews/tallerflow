import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { calcularDuracionMinutos, obtenerEstadoTecnico } from "@/lib/services/marcaje-service";
import { socketEmit } from "@/lib/socket/socket-emitter";
import { marcajeToPayload } from "@/lib/socket/payload-builders";

const schema = z.object({
  marcajeId: z.string().uuid().optional(),
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

  // Find open PAUSA marcaje
  const marcajePausa = await prisma.marcaje.findFirst({
    where: { usuarioId: user.id, tipo: "PAUSA", horaFin: null },
    orderBy: { horaInicio: "desc" },
    include: {
      actividad: { select: { id: true, nombre: true, color: true, productiva: true } },
      ordenTrabajo: { select: { id: true, numero: true, nombre: true } },
    },
  });

  if (!marcajePausa) {
    return Response.json({ error: "No hay pausa activa" }, { status: 400 });
  }

  // Find the marcaje before the pause to restore its activity
  const marcajeAntesPausa = await prisma.marcaje.findFirst({
    where: {
      usuarioId: user.id,
      horaFin: { not: null },
      createdAt: { lt: marcajePausa.createdAt },
    },
    orderBy: { horaInicio: "desc" },
  });

  const now = new Date();
  const duracionPausa = calcularDuracionMinutos(marcajePausa.horaInicio, now);

  await prisma.marcaje.update({
    where: { id: marcajePausa.id },
    data: { horaFin: now, duracionMinutos: duracionPausa },
  });

  const actividadId = marcajeAntesPausa?.actividadId ?? marcajePausa.actividadId;
  const ordenTrabajoId = marcajeAntesPausa?.ordenTrabajoId ?? marcajePausa.ordenTrabajoId;

  const marcajeReanudado = await prisma.marcaje.create({
    data: {
      usuarioId: user.id,
      actividadId,
      ordenTrabajoId: ordenTrabajoId ?? null,
      tipo: "REANUDACION",
      horaInicio: now,
      sucursalId: user.sucursalId,
      turnoId: marcajePausa.turnoId,
    },
    select: MARCAJE_SELECT,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "REANUDAR_MARCAJE",
    entidad: "Marcaje",
    entidadId: marcajeReanudado.id,
  });

  // ── Emisiones Socket.io ────────────────────────────────────────────────
  // marcaje:actualizado para el marcaje de pausa que recién cerramos
  socketEmit.marcajeActualizado(user.sucursalId, {
    marcaje: marcajeToPayload(
      {
        ...marcajePausa,
        horaFin: now,
        duracionMinutos: duracionPausa,
      },
      user.sucursalId
    ),
  });

  // estado: PAUSA → estado derivado de la actividad reanudada
  const estadoNuevo = obtenerEstadoTecnico({
    horaFin: null,
    tipo: "REANUDACION",
    actividad: {
      nombre: marcajeReanudado.actividad.nombre,
      productiva: marcajeReanudado.actividad.productiva,
    },
  });

  if (estadoNuevo !== "PAUSA") {
    socketEmit.tecnicoEstadoCambio(user.sucursalId, {
      tecnicoId: user.id,
      estadoAnterior: "PAUSA",
      estadoNuevo,
      actividad: {
        id: marcajeReanudado.actividad.id,
        nombre: marcajeReanudado.actividad.nombre,
        productiva: marcajeReanudado.actividad.productiva,
      },
      of: marcajeReanudado.ordenTrabajo
        ? {
            id: marcajeReanudado.ordenTrabajo.id,
            numero: marcajeReanudado.ordenTrabajo.numero,
          }
        : null,
    });
  }

  return Response.json({ marcajeReanudado });
}
