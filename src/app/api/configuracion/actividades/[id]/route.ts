import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";
import { cache } from "@/lib/cache";

const updateSchema = z
  .object({
    nombre: z.string().min(1).max(100).optional(),
    icono: z.string().nullable().optional(),
    color: z.string().min(1).optional(),
    productiva: z.boolean().optional(),
    activa: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Debe proporcionar al menos un campo",
  });

async function resolverActividad(id: string, userRol: string, userSucursalId: string) {
  const a = await prisma.actividad.findUnique({
    where: { id },
    select: {
      id: true,
      sucursalId: true,
      productiva: true,
      nombre: true,
      color: true,
      icono: true,
      activa: true,
    },
  });
  if (!a) return null;
  // JEFE_TALLER solo gestiona actividades de su sucursal
  if (userRol === "JEFE_TALLER" && a.sucursalId !== userSucursalId) return null;
  return a;
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const actividad = await resolverActividad(id, user.rol, user.sucursalId);
  if (!actividad) {
    return Response.json({ error: "Actividad no encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const warnings: string[] = [];

  // Advertencia si cambia "productiva": cuántos marcajes históricos afecta
  if (data.productiva !== undefined && data.productiva !== actividad.productiva) {
    const marcajesAfectados = await prisma.marcaje.count({
      where: { actividadId: id, horaFin: { not: null } },
    });
    if (marcajesAfectados > 0) {
      warnings.push(
        `Cambiar "productiva" afectará el cálculo de productividad histórica de ${marcajesAfectados} marcaje${marcajesAfectados === 1 ? "" : "s"} cerrado${marcajesAfectados === 1 ? "" : "s"}`
      );
    }
  }

  const updated = await prisma.actividad.update({
    where: { id },
    data,
  });

  // Invalidate so /api/actividades returns the updated list
  cache.invalidatePrefix("actividades:");

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ACTUALIZAR_ACTIVIDAD",
    entidad: "Actividad",
    entidadId: id,
    datosAnteriores: {
      nombre: actividad.nombre,
      color: actividad.color,
      productiva: actividad.productiva,
      activa: actividad.activa,
    },
    datosNuevos: data,
    ip: getClientIp(request),
  });

  return Response.json({ actividad: updated, warnings });
}
