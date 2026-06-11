import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";
import { cache } from "@/lib/cache";

const listQuerySchema = z.object({
  sucursalId: z.uuid().optional(),
  incluirInactivas: z
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

  const { sucursalId, incluirInactivas } = parsed.data;
  const efectivoSucursalId = user.rol === "ADMIN" ? sucursalId : user.sucursalId;

  // Mes en curso
  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const actividades = await prisma.actividad.findMany({
    where: {
      ...(incluirInactivas ? {} : { activa: true }),
      OR: [
        { sucursalId: null }, // globales
        { sucursalId: efectivoSucursalId ?? undefined },
      ],
    },
    orderBy: [{ productiva: "desc" }, { nombre: "asc" }],
    select: {
      id: true,
      nombre: true,
      icono: true,
      color: true,
      productiva: true,
      activa: true,
      sucursalId: true,
      createdAt: true,
      marcajes: {
        where: { horaInicio: { gte: inicioMes } },
        select: { duracionMinutos: true },
      },
    },
  });

  const data = actividades.map(({ marcajes, ...a }) => {
    const marcajesMes = marcajes.length;
    const hhTotalMes = marcajes.reduce((acc, m) => acc + (m.duracionMinutos ?? 0), 0) / 60;
    return {
      ...a,
      alcance: a.sucursalId ? "sucursal" : "global",
      marcajesMes,
      hhTotalMes: Math.round(hhTotalMes * 10) / 10,
    };
  });

  return Response.json({ data });
}

// ── POST — crear actividad ────────────────────────────────────────────────

const crearSchema = z.object({
  nombre: z.string().min(1).max(100),
  icono: z.string().optional(),
  color: z.string().min(1),
  productiva: z.boolean(),
  sucursalId: z.uuid().nullable().optional(),
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

  // JEFE_TALLER: solo puede crear actividades de su propia sucursal
  // (no puede crear globales ni de otra sucursal)
  if (user.rol === "JEFE_TALLER") {
    if (data.sucursalId === null || data.sucursalId === undefined) {
      return Response.json(
        { error: "Solo ADMIN puede crear actividades globales" },
        { status: 403 }
      );
    }
    if (data.sucursalId !== user.sucursalId) {
      return Response.json(
        { error: "Solo puedes crear actividades para tu sucursal" },
        { status: 403 }
      );
    }
  }

  const sucursalId = data.sucursalId ?? null;

  // Unicidad de nombre dentro del scope
  const duplicado = await prisma.actividad.findFirst({
    where: {
      nombre: { equals: data.nombre, mode: "insensitive" },
      sucursalId,
    },
    select: { id: true },
  });
  if (duplicado) {
    return Response.json(
      { error: "Ya existe una actividad con ese nombre en este ámbito" },
      { status: 409 }
    );
  }

  const actividad = await prisma.actividad.create({
    data: {
      nombre: data.nombre,
      icono: data.icono ?? null,
      color: data.color,
      productiva: data.productiva,
      sucursalId,
      activa: true,
    },
  });

  // Invalidate actividades cache for all sucursales (global actividades affect all)
  cache.invalidatePrefix("actividades:");

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "CREAR_ACTIVIDAD",
    entidad: "Actividad",
    entidadId: actividad.id,
    datosNuevos: {
      nombre: actividad.nombre,
      productiva: actividad.productiva,
      sucursalId,
    },
    ip: getClientIp(request),
  });

  return Response.json({ actividad }, { status: 201 });
}
