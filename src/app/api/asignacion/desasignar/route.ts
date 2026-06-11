import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import {
  puedeGestionarAsignacion,
  warningSinTecnicos,
  type MutationWarning,
} from "@/lib/services/asignacion-service";

const schema = z.object({
  tecnicoId: z.uuid("tecnicoId inválido"),
  ordenTrabajoId: z.uuid("ordenTrabajoId inválido"),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  if (!puedeGestionarAsignacion(user.rol)) {
    return Response.json({ error: "Sin permisos para desasignar técnicos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { tecnicoId, ordenTrabajoId } = parsed.data;

  // Find the active assignment (unique compound key)
  const asignacion = await prisma.asignacionTecnico.findFirst({
    where: {
      usuarioId: tecnicoId,
      ordenTrabajoId,
      activa: true,
    },
    include: {
      ordenTrabajo: {
        select: {
          numero: true,
          estado: true,
          sucursalId: true,
          asignaciones: { where: { activa: true }, select: { id: true } },
        },
      },
      usuario: { select: { nombre: true, apellido: true } },
    },
  });

  if (!asignacion) {
    return Response.json({ error: "Asignación activa no encontrada" }, { status: 404 });
  }

  // Row-level security
  if (user.rol !== "ADMIN" && asignacion.ordenTrabajo.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Asignación de otra sucursal" }, { status: 403 });
  }

  // Soft delete
  await prisma.asignacionTecnico.update({
    where: { id: asignacion.id },
    data: { activa: false },
  });

  const asignadosTras = asignacion.ordenTrabajo.asignaciones.length - 1;
  const warnings: MutationWarning[] = [];
  const wSin = warningSinTecnicos(asignadosTras, asignacion.ordenTrabajo.estado);
  if (wSin) warnings.push(wSin);

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "DESASIGNAR_TECNICO",
    entidad: "AsignacionTecnico",
    entidadId: asignacion.id,
    datosAnteriores: {
      tecnicoId,
      tecnicoNombre: `${asignacion.usuario.nombre} ${asignacion.usuario.apellido}`,
      ordenTrabajoId,
      ofNumero: asignacion.ordenTrabajo.numero,
      hhPlanificadas: asignacion.hhPlanificadas,
    },
    ip: getClientIp(request),
  });

  return Response.json({ ok: true, warnings });
}
