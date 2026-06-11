import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import {
  detectarConflictos,
  HH_CAPACIDAD_DIARIA,
  puedeGestionarAsignacion,
} from "@/lib/services/asignacion-service";

const schema = z.object({
  sucursalId: z.uuid(),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  if (!puedeGestionarAsignacion(user.rol)) {
    return Response.json({ error: "Sin permisos para publicar el plan" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { sucursalId } = parsed.data;

  // Non-ADMIN can only publish for their own sucursal
  if (user.rol !== "ADMIN" && sucursalId !== user.sucursalId) {
    return Response.json({ error: "Solo puede publicar el plan de su sucursal" }, { status: 403 });
  }

  // Gather snapshot for the summary
  const [tecnicos, ordenes] = await Promise.all([
    prisma.usuario.findMany({
      where: { rol: "TECNICO", activo: true, sucursalId },
      select: {
        id: true,
        asignaciones: {
          where: {
            activa: true,
            ordenTrabajo: { estado: { not: "FINALIZADA" }, eliminada: false },
          },
          select: { hhPlanificadas: true },
        },
      },
    }),
    prisma.ordenTrabajo.findMany({
      where: { sucursalId, eliminada: false, estado: { not: "FINALIZADA" } },
      select: {
        tecnicosRequeridos: true,
        slaVencimiento: true,
        estado: true,
        asignaciones: {
          where: { activa: true },
          select: { usuarioId: true, hhPlanificadas: true },
        },
      },
    }),
  ]);

  // Build per-technician total load
  const hhPorTecnicoTotal: Record<string, number> = {};
  for (const t of tecnicos) {
    hhPorTecnicoTotal[t.id] = t.asignaciones.reduce((acc, a) => acc + a.hhPlanificadas, 0);
  }

  let hhTotal = 0;
  let conflictosTotal = 0;

  for (const of_ of ordenes) {
    const asignadosCount = of_.asignaciones.length;
    const hhTecnicos = of_.asignaciones.map((a) => hhPorTecnicoTotal[a.usuarioId] ?? 0);
    hhTotal += of_.asignaciones.reduce((acc, a) => acc + a.hhPlanificadas, 0);

    const c = detectarConflictos({
      of: {
        tecnicosRequeridos: of_.tecnicosRequeridos,
        slaVencimiento: of_.slaVencimiento,
        estado: of_.estado,
      },
      asignadosCount,
      hhPorTecnico: hhTecnicos,
    });
    conflictosTotal += c.filter((x) => x.nivel === "error").length;
  }

  const tecnicosConAsignacion = tecnicos.filter((t) => hhPorTecnicoTotal[t.id] ?? 0 > 0).length;

  const resumen = {
    tecnicos: tecnicosConAsignacion,
    ordenes: ordenes.length,
    hhTotal: Math.round(hhTotal * 10) / 10,
    conflictos: conflictosTotal,
    hhDisponibles: tecnicos.length * HH_CAPACIDAD_DIARIA,
  };

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "PUBLICAR_PLAN_ASIGNACION",
    entidad: "Sucursal",
    entidadId: sucursalId,
    datosNuevos: resumen,
    ip: getClientIp(request),
  });

  return Response.json({ ok: true, resumen });
}
