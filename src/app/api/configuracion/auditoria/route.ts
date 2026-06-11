import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import type { Prisma } from "@/generated/prisma";

const ROLES_AUDITORIA = ["ADMIN", "CONTROL_GESTION"] as const;

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
  usuarioId: z.uuid().optional(),
  accion: z.string().min(1).optional(),
  entidad: z.string().min(1).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!(ROLES_AUDITORIA as readonly string[]).includes(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { usuarioId, accion, entidad, desde, hasta, pagina, porPagina } = parsed.data;

  // A01: CONTROL_GESTION is scoped to their own sucursal — ADMIN sees all.
  const efectivoSucursalId =
    user.rol === "ADMIN" ? (parsed.data.sucursalId ?? undefined) : user.sucursalId;

  // Resolver IDs de usuarios según el filtro de sucursal
  let usuarioIdsFiltro: string[] | undefined;
  if (efectivoSucursalId) {
    const usuariosSucursal = await prisma.usuario.findMany({
      where: { sucursalId: efectivoSucursalId },
      select: { id: true },
    });
    usuarioIdsFiltro = usuariosSucursal.map((u) => u.id);
    if (usuarioIdsFiltro.length === 0) {
      return Response.json({ data: [], total: 0, pagina, totalPaginas: 1, porPagina });
    }
  }

  // Build the user-id filter respecting the sucursal scope.
  // If both a specific usuarioId AND a sucursal scope are active, the
  // usuarioId must be in the allowed set — otherwise the result is empty.
  let userIdWhere: Prisma.LogAuditoriaWhereInput = {};
  if (usuarioId) {
    if (usuarioIdsFiltro && !usuarioIdsFiltro.includes(usuarioId)) {
      // Requested user is outside the caller's sucursal scope
      return Response.json({ data: [], total: 0, pagina, totalPaginas: 1, porPagina });
    }
    userIdWhere = { usuarioId };
  } else if (usuarioIdsFiltro) {
    userIdWhere = { usuarioId: { in: usuarioIdsFiltro } };
  }

  const where: Prisma.LogAuditoriaWhereInput = {
    ...userIdWhere,
    ...(accion ? { accion: { contains: accion, mode: "insensitive" } } : {}),
    ...(entidad ? { entidad: { equals: entidad, mode: "insensitive" } } : {}),
    ...(desde || hasta
      ? {
          createdAt: {
            ...(desde ? { gte: new Date(`${desde}T00:00:00.000Z`) } : {}),
            ...(hasta ? { lte: new Date(`${hasta}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };

  const skip = (pagina - 1) * porPagina;

  const [total, registros] = await Promise.all([
    prisma.logAuditoria.count({ where }),
    prisma.logAuditoria.findMany({
      where,
      skip,
      take: porPagina,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        accion: true,
        entidad: true,
        entidadId: true,
        datosAnteriores: true,
        datosNuevos: true,
        ip: true,
        dispositivo: true,
        createdAt: true,
        usuario: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            iniciales: true,
            rol: true,
            color: true,
          },
        },
      },
    }),
  ]);

  const data = registros.map((r) => ({
    ...r,
    datosAnteriores: parseJson(r.datosAnteriores),
    datosNuevos: parseJson(r.datosNuevos),
  }));

  return Response.json({
    data,
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    porPagina,
  });
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
