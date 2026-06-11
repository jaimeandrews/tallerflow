import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";

const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)");

function seSuperponen(ini1: string, fin1: string, ini2: string, fin2: string): boolean {
  return ini1 < fin2 && fin1 > ini2;
}

const updateSchema = z
  .object({
    nombre: z.string().min(1).max(100).optional(),
    horaInicio: horaSchema.optional(),
    horaFin: horaSchema.optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Debe proporcionar al menos un campo",
  });

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const turnoActual = await prisma.turno.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      horaInicio: true,
      horaFin: true,
      sucursalId: true,
      activo: true,
    },
  });

  if (!turnoActual) {
    return Response.json({ error: "Turno no encontrado" }, { status: 404 });
  }
  if (user.rol === "JEFE_TALLER" && turnoActual.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Sin permisos sobre este turno" }, { status: 403 });
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

  // Calcular horario efectivo tras el update
  const horaInicioEfectiva = data.horaInicio ?? turnoActual.horaInicio;
  const horaFinEfectiva = data.horaFin ?? turnoActual.horaFin;

  if (horaInicioEfectiva >= horaFinEfectiva) {
    return Response.json(
      { error: "La hora de inicio debe ser anterior a la hora de fin" },
      { status: 400 }
    );
  }

  // Validar solapamiento solo si cambian horarios
  if (data.horaInicio !== undefined || data.horaFin !== undefined) {
    const turnosOtros = await prisma.turno.findMany({
      where: {
        sucursalId: turnoActual.sucursalId,
        activo: true,
        id: { not: id }, // excluir el propio
      },
      select: { id: true, nombre: true, horaInicio: true, horaFin: true },
    });

    const conflicto = turnosOtros.find((t) =>
      seSuperponen(horaInicioEfectiva, horaFinEfectiva, t.horaInicio, t.horaFin)
    );
    if (conflicto) {
      return Response.json(
        {
          error: `El horario se solapa con el turno "${conflicto.nombre}" (${conflicto.horaInicio}–${conflicto.horaFin})`,
        },
        { status: 409 }
      );
    }
  }

  const turno = await prisma.turno.update({
    where: { id },
    data,
    select: {
      id: true,
      nombre: true,
      horaInicio: true,
      horaFin: true,
      sucursalId: true,
      activo: true,
      updatedAt: true,
    },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ACTUALIZAR_TURNO",
    entidad: "Turno",
    entidadId: id,
    datosAnteriores: {
      nombre: turnoActual.nombre,
      horaInicio: turnoActual.horaInicio,
      horaFin: turnoActual.horaFin,
      activo: turnoActual.activo,
    },
    datosNuevos: data,
    ip: getClientIp(request),
  });

  return Response.json({ turno });
}
