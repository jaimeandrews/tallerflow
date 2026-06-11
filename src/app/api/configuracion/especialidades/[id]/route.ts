import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";
import { cache, CACHE_KEYS } from "@/lib/cache";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  // Solo ADMIN puede eliminar especialidades globales
  if (user.rol !== "ADMIN") {
    return Response.json({ error: "Solo ADMIN puede eliminar especialidades" }, { status: 403 });
  }

  const { id } = await params;

  const especialidad = await prisma.especialidad.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      _count: { select: { usuarios: true } },
    },
  });

  if (!especialidad) {
    return Response.json({ error: "Especialidad no encontrada" }, { status: 404 });
  }

  if (especialidad._count.usuarios > 0) {
    return Response.json(
      {
        error: `No se puede eliminar: ${especialidad._count.usuarios} técnico${especialidad._count.usuarios === 1 ? "" : "s"} tiene${especialidad._count.usuarios === 1 ? "" : "n"} esta especialidad. Desasigna la especialidad antes de eliminarla.`,
      },
      { status: 409 }
    );
  }

  await prisma.especialidad.delete({ where: { id } });

  cache.invalidate(CACHE_KEYS.especialidades);

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ELIMINAR_ESPECIALIDAD",
    entidad: "Especialidad",
    entidadId: id,
    datosAnteriores: { nombre: especialidad.nombre },
    ip: getClientIp(request),
  });

  return Response.json({ ok: true });
}
