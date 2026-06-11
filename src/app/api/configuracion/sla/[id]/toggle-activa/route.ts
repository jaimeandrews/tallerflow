import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const regla = await prisma.configuracionSLA.findUnique({
    where: { id },
    select: { id: true, sucursalId: true, nombre: true, activa: true },
  });

  if (!regla) {
    return Response.json({ error: "Regla SLA no encontrada" }, { status: 404 });
  }
  if (user.rol === "JEFE_TALLER" && regla.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Sin permisos sobre esta regla" }, { status: 403 });
  }

  const nuevaActiva = !regla.activa;
  await prisma.configuracionSLA.update({
    where: { id },
    data: { activa: nuevaActiva },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: nuevaActiva ? "ACTIVAR_REGLA_SLA" : "DESACTIVAR_REGLA_SLA",
    entidad: "ConfiguracionSLA",
    entidadId: id,
    datosNuevos: { activa: nuevaActiva },
    ip: getClientIp(request),
  });

  return Response.json({ activa: nuevaActiva });
}
