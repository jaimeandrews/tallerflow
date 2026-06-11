import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";
import { cache } from "@/lib/cache";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const actividad = await prisma.actividad.findUnique({
    where: { id },
    select: { id: true, nombre: true, sucursalId: true, activa: true },
  });

  if (!actividad) {
    return Response.json({ error: "Actividad no encontrada" }, { status: 404 });
  }
  if (user.rol === "JEFE_TALLER" && actividad.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Sin permisos sobre esta actividad" }, { status: 403 });
  }

  // Si se está desactivando, verificar que no haya marcajes activos con ella
  if (actividad.activa) {
    const marcajesActivos = await prisma.marcaje.count({
      where: { actividadId: id, horaFin: null },
    });
    if (marcajesActivos > 0) {
      return Response.json(
        {
          error: `No se puede desactivar: hay ${marcajesActivos} marcaje${marcajesActivos === 1 ? "" : "s"} activo${marcajesActivos === 1 ? "" : "s"} con esta actividad`,
        },
        { status: 409 }
      );
    }
  }

  const nuevaActiva = !actividad.activa;
  await prisma.actividad.update({ where: { id }, data: { activa: nuevaActiva } });

  // Activating/deactivating changes which actividades are visible → invalidate cache
  cache.invalidatePrefix("actividades:");

  void registrarAuditoria({
    usuarioId: user.id,
    accion: nuevaActiva ? "ACTIVAR_ACTIVIDAD" : "DESACTIVAR_ACTIVIDAD",
    entidad: "Actividad",
    entidadId: id,
    datosNuevos: { activa: nuevaActiva },
    ip: getClientIp(request),
  });

  return Response.json({ activa: nuevaActiva });
}
