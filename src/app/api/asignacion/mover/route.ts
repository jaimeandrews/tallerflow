import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import {
  calcularHHPlanificadasSugeridas,
  puedeGestionarAsignacion,
} from "@/lib/services/asignacion-service";

const schema = z.object({
  tecnicoId: z.uuid(),
  desdeOrdenId: z.uuid(),
  haciaOrdenId: z.uuid(),
  hhPlanificadas: z.number().positive().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  if (!puedeGestionarAsignacion(user.rol)) {
    return Response.json({ error: "Sin permisos para mover técnicos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { tecnicoId, desdeOrdenId, haciaOrdenId, hhPlanificadas: hhInput } = parsed.data;

  if (desdeOrdenId === haciaOrdenId) {
    return Response.json({ error: "La OF origen y destino son la misma" }, { status: 400 });
  }

  const [asignacionOrigen, ofDestino] = await Promise.all([
    prisma.asignacionTecnico.findFirst({
      where: { usuarioId: tecnicoId, ordenTrabajoId: desdeOrdenId, activa: true },
      include: {
        ordenTrabajo: { select: { numero: true, sucursalId: true } },
        usuario: { select: { nombre: true, apellido: true } },
      },
    }),
    prisma.ordenTrabajo.findFirst({
      where: {
        id: haciaOrdenId,
        eliminada: false,
        estado: { not: "FINALIZADA" },
        ...(user.rol !== "ADMIN" ? { sucursalId: user.sucursalId } : {}),
      },
      select: {
        id: true,
        numero: true,
        nombre: true,
        sucursalId: true,
        hhEstimadas: true,
        tecnicosRequeridos: true,
        estado: true,
        asignaciones: { where: { activa: true }, select: { id: true, usuarioId: true } },
      },
    }),
  ]);

  if (!asignacionOrigen) {
    return Response.json({ error: "Asignación origen no encontrada" }, { status: 404 });
  }
  if (!ofDestino) {
    return Response.json({ error: "OF destino no encontrada" }, { status: 404 });
  }
  if (asignacionOrigen.ordenTrabajo.sucursalId !== ofDestino.sucursalId) {
    return Response.json({ error: "Las OFs no pertenecen a la misma sucursal" }, { status: 400 });
  }
  if (user.rol !== "ADMIN" && ofDestino.sucursalId !== user.sucursalId) {
    return Response.json({ error: "OF de otra sucursal" }, { status: 403 });
  }

  const hh =
    hhInput ?? calcularHHPlanificadasSugeridas(ofDestino.hhEstimadas, ofDestino.tecnicosRequeridos);

  // Execute as transaction: deactivate origin, upsert destination
  const [, asignacionDestino] = await prisma.$transaction([
    prisma.asignacionTecnico.update({
      where: { id: asignacionOrigen.id },
      data: { activa: false },
    }),
    prisma.asignacionTecnico.upsert({
      where: {
        ordenTrabajoId_usuarioId: { ordenTrabajoId: haciaOrdenId, usuarioId: tecnicoId },
      },
      create: {
        ordenTrabajoId: haciaOrdenId,
        usuarioId: tecnicoId,
        hhPlanificadas: hh,
        activa: true,
      },
      update: { activa: true, hhPlanificadas: hh, fechaAsignacion: new Date() },
      select: {
        id: true,
        hhPlanificadas: true,
        fechaAsignacion: true,
        usuario: {
          select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
        },
      },
    }),
  ]);

  // Reload both OFs with updated assignment counts
  const [ofOrigenActualizada, ofDestinoActualizada] = await Promise.all([
    prisma.ordenTrabajo.findUnique({
      where: { id: desdeOrdenId },
      select: {
        id: true,
        numero: true,
        nombre: true,
        estado: true,
        asignaciones: {
          where: { activa: true },
          select: {
            id: true,
            hhPlanificadas: true,
            usuario: {
              select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
            },
          },
        },
      },
    }),
    prisma.ordenTrabajo.findUnique({
      where: { id: haciaOrdenId },
      select: {
        id: true,
        numero: true,
        nombre: true,
        estado: true,
        asignaciones: {
          where: { activa: true },
          select: {
            id: true,
            hhPlanificadas: true,
            usuario: {
              select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
            },
          },
        },
      },
    }),
  ]);

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "MOVER_TECNICO",
    entidad: "AsignacionTecnico",
    datosAnteriores: { desdeOrdenId, desdeOfNumero: asignacionOrigen.ordenTrabajo.numero },
    datosNuevos: {
      tecnicoId,
      tecnicoNombre: `${asignacionOrigen.usuario.nombre} ${asignacionOrigen.usuario.apellido}`,
      haciaOrdenId,
      haciaOfNumero: ofDestino.numero,
      hhPlanificadas: hh,
    },
    ip: getClientIp(request),
  });

  return Response.json({
    asignacionDestino,
    ofOrigen: ofOrigenActualizada,
    ofDestino: ofDestinoActualizada,
  });
}
