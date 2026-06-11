import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import {
  calcularHHPlanificadasSugeridas,
  HH_CAPACIDAD_DIARIA,
  puedeGestionarAsignacion,
  warningExcedeTecnicos,
  warningsSobreCapacidad,
  type MutationWarning,
} from "@/lib/services/asignacion-service";

const schema = z.object({
  tecnicoId: z.uuid("tecnicoId inválido"),
  ordenTrabajoId: z.uuid("ordenTrabajoId inválido"),
  hhPlanificadas: z
    .number()
    .positive()
    .max(HH_CAPACIDAD_DIARIA * 7)
    .optional(),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  if (!puedeGestionarAsignacion(user.rol)) {
    return Response.json({ error: "Sin permisos para asignar técnicos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { tecnicoId, ordenTrabajoId, hhPlanificadas: hhInput } = parsed.data;

  // Load tecnico and OF in parallel, enforce same sucursal
  const [tecnico, of] = await Promise.all([
    prisma.usuario.findFirst({
      where: {
        id: tecnicoId,
        activo: true,
        ...(user.rol !== "ADMIN" ? { sucursalId: user.sucursalId } : {}),
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        sucursalId: true,
        asignaciones: {
          where: { activa: true },
          select: { hhPlanificadas: true },
        },
      },
    }),
    prisma.ordenTrabajo.findFirst({
      where: {
        id: ordenTrabajoId,
        eliminada: false,
        ...(user.rol !== "ADMIN" ? { sucursalId: user.sucursalId } : {}),
      },
      select: {
        id: true,
        numero: true,
        nombre: true,
        sucursalId: true,
        estado: true,
        hhEstimadas: true,
        tecnicosRequeridos: true,
        asignaciones: {
          where: { activa: true },
          select: { id: true, usuarioId: true },
        },
      },
    }),
  ]);

  if (!tecnico) return Response.json({ error: "Técnico no encontrado" }, { status: 404 });
  if (!of) return Response.json({ error: "Orden de trabajo no encontrada" }, { status: 404 });

  if (tecnico.sucursalId !== of.sucursalId) {
    return Response.json(
      { error: "El técnico y la OF no pertenecen a la misma sucursal" },
      { status: 400 }
    );
  }

  if (of.estado === "FINALIZADA") {
    return Response.json(
      { error: "No se puede asignar técnicos a una OF finalizada" },
      { status: 400 }
    );
  }

  // Calculate hhPlanificadas
  const hh = hhInput ?? calcularHHPlanificadasSugeridas(of.hhEstimadas, of.tecnicosRequeridos);

  // Upsert — handles both new assignments and reactivating soft-deleted ones
  const asignacion = await prisma.asignacionTecnico.upsert({
    where: {
      ordenTrabajoId_usuarioId: { ordenTrabajoId, usuarioId: tecnicoId },
    },
    create: {
      ordenTrabajoId,
      usuarioId: tecnicoId,
      hhPlanificadas: hh,
      activa: true,
    },
    update: {
      activa: true,
      hhPlanificadas: hh,
      fechaAsignacion: new Date(),
    },
    select: {
      id: true,
      hhPlanificadas: true,
      fechaAsignacion: true,
      usuario: {
        select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
      },
    },
  });

  // Compute warnings
  const hhAsignadasTras = tecnico.asignaciones.reduce((acc, a) => acc + a.hhPlanificadas, 0) + hh;
  const asignadosTras = of.asignaciones.filter((a) => a.usuarioId !== tecnicoId).length + 1;

  const warnings: MutationWarning[] = [];
  const wCap = warningsSobreCapacidad(hhAsignadasTras);
  if (wCap) warnings.push(wCap);
  const wExc = warningExcedeTecnicos(asignadosTras, of.tecnicosRequeridos);
  if (wExc) warnings.push(wExc);

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ASIGNAR_TECNICO",
    entidad: "AsignacionTecnico",
    entidadId: asignacion.id,
    datosNuevos: {
      tecnicoId,
      tecnicoNombre: `${tecnico.nombre} ${tecnico.apellido}`,
      ordenTrabajoId,
      ofNumero: of.numero,
      hhPlanificadas: hh,
    },
    ip: getClientIp(request),
  });

  return Response.json({ asignacion, warnings }, { status: 201 });
}
