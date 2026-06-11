import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { calcularDuracionMinutos, obtenerEstadoTecnico } from "@/lib/services/marcaje-service";
import { socketEmit } from "@/lib/socket/socket-emitter";
import { getTecnicoMini, marcajeToPayload } from "@/lib/socket/payload-builders";

const schema = z.object({
  ordenTrabajoId: z.string().uuid().optional(),
  actividadId: z.string().uuid(),
  dispositivo: z.string().optional(),
  idOffline: z.string().optional(),
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

  const { ordenTrabajoId, actividadId, dispositivo, idOffline } = parsed.data;

  // Deduplication
  if (idOffline) {
    const dup = await prisma.marcaje.findUnique({ where: { idOffline } });
    if (dup) {
      return Response.json({ error: "Marcaje duplicado", marcajeId: dup.id }, { status: 409 });
    }
  }

  // Verify actividad belongs to user's sucursal (or is global)
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

  // Verify OF if provided
  let ofTransicion: { numero: string; estadoAnterior: "PENDIENTE" } | null = null;
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
    if (of.estado === "PENDIENTE") {
      await prisma.ordenTrabajo.update({
        where: { id: ordenTrabajoId },
        data: { estado: "EN_PROCESO" },
      });
      ofTransicion = { numero: of.numero, estadoAnterior: "PENDIENTE" };
    }
  }

  const now = new Date();

  // Close any existing open marcaje — capturamos actividad para poder
  // computar estadoAnterior del técnico antes de modificarlo.
  const marcajeAbierto = await prisma.marcaje.findFirst({
    where: { usuarioId: user.id, horaFin: null },
    orderBy: { horaInicio: "desc" },
    include: {
      actividad: { select: { nombre: true, productiva: true } },
    },
  });
  const estadoAnterior = obtenerEstadoTecnico(marcajeAbierto);
  if (marcajeAbierto) {
    const duracion = calcularDuracionMinutos(marcajeAbierto.horaInicio, now);
    await prisma.marcaje.update({
      where: { id: marcajeAbierto.id },
      data: { horaFin: now, duracionMinutos: duracion },
    });
  }

  // Get active turno
  const turno = await prisma.turno.findFirst({
    where: { sucursalId: user.sucursalId, activo: true },
  });

  const marcaje = await prisma.marcaje.create({
    data: {
      usuarioId: user.id,
      actividadId,
      ordenTrabajoId: ordenTrabajoId ?? null,
      tipo: "INICIO",
      horaInicio: now,
      sucursalId: user.sucursalId,
      turnoId: turno?.id ?? null,
      dispositivo: dispositivo ?? null,
      idOffline: idOffline ?? null,
      creadoOffline: !!idOffline,
    },
    select: MARCAJE_SELECT,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "INICIAR_MARCAJE",
    entidad: "Marcaje",
    entidadId: marcaje.id,
    datosNuevos: { actividadId, ordenTrabajoId },
    dispositivo,
  });

  // ── Emisiones Socket.io ────────────────────────────────────────────────
  // Estado nuevo: derivado del marcaje recién creado (TRABAJANDO si la
  // actividad es productiva, ALMUERZO/DETENIDO según nombre, etc.)
  const estadoNuevo = obtenerEstadoTecnico({
    horaFin: null,
    tipo: "INICIO",
    actividad: {
      nombre: marcaje.actividad.nombre,
      productiva: marcaje.actividad.productiva,
    },
  });

  void (async () => {
    const tecnico = await getTecnicoMini(user.id);
    if (!tecnico) return;
    const marcajePayload = marcajeToPayload(marcaje, user.sucursalId);

    socketEmit.marcajeNuevo(user.sucursalId, {
      marcaje: marcajePayload,
      tecnico,
      of: marcaje.ordenTrabajo
        ? { id: marcaje.ordenTrabajo.id, numero: marcaje.ordenTrabajo.numero }
        : null,
    });

    if (estadoNuevo !== estadoAnterior) {
      socketEmit.tecnicoEstadoCambio(user.sucursalId, {
        tecnicoId: user.id,
        estadoAnterior,
        estadoNuevo,
        actividad: {
          id: marcaje.actividad.id,
          nombre: marcaje.actividad.nombre,
          productiva: marcaje.actividad.productiva,
        },
        of: marcaje.ordenTrabajo
          ? { id: marcaje.ordenTrabajo.id, numero: marcaje.ordenTrabajo.numero }
          : null,
      });
    }

    // OF que transicionó automáticamente PENDIENTE → EN_PROCESO al iniciar
    // un marcaje sobre ella.
    if (ofTransicion && ordenTrabajoId) {
      socketEmit.ofEstadoCambio(user.sucursalId, {
        ofId: ordenTrabajoId,
        ofNumero: ofTransicion.numero,
        estadoAnterior: ofTransicion.estadoAnterior,
        estadoNuevo: "EN_PROCESO",
      });
    }
  })();

  return Response.json({ marcaje }, { status: 201 });
}
