import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp, invalidarCacheUsuario } from "@/lib/auth/api-auth";
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

  // No puede desactivarse a sí mismo
  if (id === user.id) {
    return Response.json({ error: "No puedes desactivar tu propia cuenta" }, { status: 403 });
  }

  const target = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, sucursalId: true, activo: true, nombre: true, apellido: true, rol: true },
  });

  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // JEFE_TALLER solo puede gestionar usuarios de su sucursal
  if (user.rol === "JEFE_TALLER" && target.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Usuario de otra sucursal" }, { status: 403 });
  }

  // JEFE_TALLER no puede desactivar a un ADMIN
  if (user.rol === "JEFE_TALLER" && target.rol === "ADMIN") {
    return Response.json(
      { error: "Sin permisos para desactivar administradores" },
      { status: 403 }
    );
  }

  const nuevoActivo = !target.activo;

  await prisma.usuario.update({
    where: { id },
    data: { activo: nuevoActivo },
  });

  // Invalida el caché de autenticación Bearer para sesiones de kiosco/tablet.
  // Sesiones NextAuth web sobreviven hasta su expiración (~15 min).
  if (!nuevoActivo) {
    invalidarCacheUsuario(id);
  }

  void registrarAuditoria({
    usuarioId: user.id,
    accion: nuevoActivo ? "ACTIVAR_USUARIO" : "DESACTIVAR_USUARIO",
    entidad: "Usuario",
    entidadId: id,
    datosNuevos: { activo: nuevoActivo },
    ip: getClientIp(request),
  });

  return Response.json({ activo: nuevoActivo });
}
