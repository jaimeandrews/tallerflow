import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";
import { cache, CACHE_KEYS } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const raw = await cache.getOrSet(CACHE_KEYS.especialidades, () =>
    prisma.especialidad.findMany({
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        createdAt: true,
        _count: { select: { usuarios: true } },
      },
    })
  );

  const data = raw.map(({ _count, ...e }) => ({
    ...e,
    totalTecnicos: _count.usuarios,
  }));

  return Response.json({ data });
}

const crearSchema = z.object({
  nombre: z.string().min(1).max(100),
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

  const existente = await prisma.especialidad.findFirst({
    where: { nombre: { equals: parsed.data.nombre, mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) {
    return Response.json({ error: "Ya existe una especialidad con ese nombre" }, { status: 409 });
  }

  const especialidad = await prisma.especialidad.create({
    data: { nombre: parsed.data.nombre },
    select: { id: true, nombre: true, createdAt: true },
  });

  cache.invalidate(CACHE_KEYS.especialidades);

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "CREAR_ESPECIALIDAD",
    entidad: "Especialidad",
    entidadId: especialidad.id,
    datosNuevos: { nombre: especialidad.nombre },
    ip: getClientIp(request),
  });

  return Response.json({ especialidad }, { status: 201 });
}
