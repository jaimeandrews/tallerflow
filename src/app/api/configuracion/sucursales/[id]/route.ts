import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";

const schema = z
  .object({
    nombre: z.string().min(1).max(100).optional(),
    codigo: z.string().min(1).max(10).optional(),
    activa: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Debe proporcionar al menos un campo para actualizar",
  });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (user.rol !== "ADMIN") {
    return Response.json({ error: "Solo ADMIN puede gestionar sucursales" }, { status: 403 });
  }

  const { id } = await params;

  const existente = await prisma.sucursal.findUnique({
    where: { id },
    select: { id: true, nombre: true, codigo: true, activa: true },
  });
  if (!existente) {
    return Response.json({ error: "Sucursal no encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Si se desactiva: computar advertencia antes de guardar.
  const warnings: string[] = [];
  if (data.activa === false && existente.activa) {
    const [usuariosActivos, ofActivas] = await Promise.all([
      prisma.usuario.count({ where: { sucursalId: id, activo: true } }),
      prisma.ordenTrabajo.count({
        where: {
          sucursalId: id,
          eliminada: false,
          estado: { not: "FINALIZADA" },
        },
      }),
    ]);
    if (usuariosActivos > 0) {
      warnings.push(
        `${usuariosActivos} usuario${usuariosActivos === 1 ? "" : "s"} activo${usuariosActivos === 1 ? "" : "s"} queda${usuariosActivos === 1 ? "" : "n"} sin sucursal activa`
      );
    }
    if (ofActivas > 0) {
      warnings.push(
        `${ofActivas} orden${ofActivas === 1 ? "" : "es"} de trabajo activa${ofActivas === 1 ? "" : "s"} en esta sucursal`
      );
    }
  }

  const sucursal = await prisma.sucursal.update({
    where: { id },
    data,
    select: {
      id: true,
      nombre: true,
      codigo: true,
      activa: true,
      updatedAt: true,
    },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ACTUALIZAR_SUCURSAL",
    entidad: "Sucursal",
    entidadId: id,
    datosAnteriores: existente,
    datosNuevos: data,
    ip: getClientIp(request),
  });

  return Response.json({ sucursal, warnings });
}
