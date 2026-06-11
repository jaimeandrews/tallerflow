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
  notas: z.string().optional(),
});

const MARCAJE_SELECT = {
  id: true,
  tipo: true,
  horaInicio: true,
  horaFin: true,
  duracionMinutos: true,
  notas: true,
  ordenTrabajoId: true,
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

  const { notas } = parsed.data;

  const marcajeActivo = await prisma.marcaje.findFirst({
    where: { usuarioId: user.id, horaFin: null },
    orderBy: { horaInicio: "desc" },
    include: {
      actividad: { select: { nombre: true, productiva: true } },
    },
  });

  if (!marcajeActivo) {
    return Response.json({ error: "No hay marcaje activo" }, { status: 400 });
  }

  const estadoAnterior = obtenerEstadoTecnico(marcajeActivo);

  const now = new Date();
  const duracion = calcularDuracionMinutos(marcajeActivo.horaInicio, now);

  const marcajeCerrado = await prisma.marcaje.update({
    where: { id: marcajeActivo.id },
    data: {
      horaFin: now,
      duracionMinutos: duracion,
      tipo: "FIN",
      notas: notas ?? null,
    },
    select: MARCAJE_SELECT,
  });

  // Recalculate hhConsumidas for the work order
  if (marcajeActivo.ordenTrabajoId) {
    const todosMarcajes = await prisma.marcaje.findMany({
      where: {
        ordenTrabajoId: marcajeActivo.ordenTrabajoId,
        horaFin: { not: null },
        duracionMinutos: { not: null },
      },
    });
    const hhConsumidas = todosMarcajes.reduce((acc, m) => acc + (m.duracionMinutos ?? 0) / 60, 0);
    await prisma.ordenTrabajo.update({
      where: { id: marcajeActivo.ordenTrabajoId },
      data: { hhConsumidas },
    });
  }

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "FINALIZAR_MARCAJE",
    entidad: "Marcaje",
    entidadId: marcajeCerrado.id,
    datosNuevos: { duracionMinutos: duracion, notas },
  });

  // ── Emisiones Socket.io ────────────────────────────────────────────────
  socketEmit.marcajeActualizado(user.sucursalId, {
    marcaje: marcajeToPayload(marcajeCerrado, user.sucursalId),
  });

  // Tras finalizar el técnico vuelve a DISPONIBLE (no hay marcaje abierto).
  if (estadoAnterior !== "DISPONIBLE") {
    socketEmit.tecnicoEstadoCambio(user.sucursalId, {
      tecnicoId: user.id,
      estadoAnterior,
      estadoNuevo: "DISPONIBLE",
      actividad: null,
      of: null,
    });
  }

  // of:estadoCambio "si aplica": hoy finalizar marcaje sólo recalcula
  // hhConsumidas, no cambia estado de la OF. Reservado para cuando una
  // regla automática (p. ej. cierre por 100% HH) lo justifique.

  return Response.json({ marcaje: marcajeCerrado });
}
