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
  motivo: z.string().optional(),
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

  const { motivo } = parsed.data;

  const marcajeActivo = await prisma.marcaje.findFirst({
    where: { usuarioId: user.id, horaFin: null },
    orderBy: { horaInicio: "desc" },
    include: {
      actividad: { select: { id: true, nombre: true, productiva: true } },
      ordenTrabajo: { select: { id: true, numero: true } },
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
    data: { horaFin: now, duracionMinutos: duracion },
    select: MARCAJE_SELECT,
  });

  const marcajePausa = await prisma.marcaje.create({
    data: {
      usuarioId: user.id,
      actividadId: marcajeActivo.actividadId,
      ordenTrabajoId: marcajeActivo.ordenTrabajoId,
      tipo: "PAUSA",
      horaInicio: now,
      sucursalId: user.sucursalId,
      turnoId: marcajeActivo.turnoId,
      notas: motivo ?? null,
    },
    select: MARCAJE_SELECT,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "PAUSAR_MARCAJE",
    entidad: "Marcaje",
    entidadId: marcajeActivo.id,
    datosNuevos: { motivo },
  });

  // ── Emisiones Socket.io ────────────────────────────────────────────────
  socketEmit.marcajeActualizado(user.sucursalId, {
    marcaje: marcajeToPayload(marcajeCerrado, user.sucursalId),
  });

  if (estadoAnterior !== "PAUSA") {
    socketEmit.tecnicoEstadoCambio(user.sucursalId, {
      tecnicoId: user.id,
      estadoAnterior,
      estadoNuevo: "PAUSA",
      actividad: {
        id: marcajeActivo.actividad.id,
        nombre: marcajeActivo.actividad.nombre,
        productiva: marcajeActivo.actividad.productiva,
      },
      of: marcajeActivo.ordenTrabajo
        ? {
            id: marcajeActivo.ordenTrabajo.id,
            numero: marcajeActivo.ordenTrabajo.numero,
          }
        : null,
    });
  }

  return Response.json({ marcajeCerrado, marcajePausa });
}
