import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";

// Valida "HH:MM" en 00:00–23:59
const horaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Formato de hora inválido (HH:MM)");

/** Devuelve true si dos turnos se solapan. Compara strings HH:MM (lexicográfico = cronológico). */
function seSuperponen(ini1: string, fin1: string, ini2: string, fin2: string): boolean {
  return ini1 < fin2 && fin1 > ini2;
}

// ── GET ────────────────────────────────────────────────────────────────────

const listQuerySchema = z.object({
  sucursalId: z.uuid().optional(),
  incluirInactivos: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const parsed = listQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { incluirInactivos } = parsed.data;
  const sucursalId = user.rol === "ADMIN" ? parsed.data.sucursalId : user.sucursalId;

  const turnos = await prisma.turno.findMany({
    where: {
      ...(sucursalId ? { sucursalId } : {}),
      ...(incluirInactivos ? {} : { activo: true }),
    },
    orderBy: [{ sucursalId: "asc" }, { horaInicio: "asc" }],
    select: {
      id: true,
      nombre: true,
      horaInicio: true,
      horaFin: true,
      sucursalId: true,
      activo: true,
      createdAt: true,
      sucursal: { select: { id: true, nombre: true, codigo: true } },
      _count: { select: { marcajes: true } },
    },
  });

  // Técnicos que han hecho marcajes en el turno (distinct usuarioId del último mes)
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const tecnicosPorTurno = await prisma.marcaje.groupBy({
    by: ["turnoId"],
    where: {
      turnoId: { in: turnos.map((t) => t.id) },
      horaInicio: { gte: inicioMes },
    },
    _count: { usuarioId: true },
  });
  const tecMap = new Map<string, number>(
    tecnicosPorTurno
      .filter((r) => r.turnoId != null)
      .map((r) => [r.turnoId as string, r._count.usuarioId])
  );

  const data = turnos.map(({ _count, ...t }) => ({
    ...t,
    totalMarcajes: _count.marcajes,
    tecnicosMes: tecMap.get(t.id) ?? 0,
  }));

  return Response.json({ data });
}

// ── POST — crear turno ─────────────────────────────────────────────────────

const crearSchema = z.object({
  nombre: z.string().min(1).max(100),
  horaInicio: horaSchema,
  horaFin: horaSchema,
  sucursalId: z.uuid(),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (data.horaInicio >= data.horaFin) {
    return Response.json(
      { error: "La hora de inicio debe ser anterior a la hora de fin" },
      { status: 400 }
    );
  }

  // JEFE_TALLER solo puede crear turnos de su sucursal
  if (user.rol === "JEFE_TALLER" && data.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Solo puedes crear turnos para tu sucursal" }, { status: 403 });
  }

  // Validar solapamiento con turnos existentes de la misma sucursal
  const turnosExistentes = await prisma.turno.findMany({
    where: { sucursalId: data.sucursalId, activo: true },
    select: { id: true, nombre: true, horaInicio: true, horaFin: true },
  });

  const conflicto = turnosExistentes.find((t) =>
    seSuperponen(data.horaInicio, data.horaFin, t.horaInicio, t.horaFin)
  );
  if (conflicto) {
    return Response.json(
      {
        error: `El horario se solapa con el turno "${conflicto.nombre}" (${conflicto.horaInicio}–${conflicto.horaFin})`,
      },
      { status: 409 }
    );
  }

  const turno = await prisma.turno.create({
    data: {
      nombre: data.nombre,
      horaInicio: data.horaInicio,
      horaFin: data.horaFin,
      sucursalId: data.sucursalId,
      activo: true,
    },
    select: {
      id: true,
      nombre: true,
      horaInicio: true,
      horaFin: true,
      sucursalId: true,
      activo: true,
    },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "CREAR_TURNO",
    entidad: "Turno",
    entidadId: turno.id,
    datosNuevos: {
      nombre: turno.nombre,
      horaInicio: turno.horaInicio,
      horaFin: turno.horaFin,
      sucursalId: turno.sucursalId,
    },
    ip: getClientIp(request),
  });

  return Response.json({ turno }, { status: 201 });
}
