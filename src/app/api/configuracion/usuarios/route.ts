import { type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import {
  colorAleatorio,
  generarIniciales,
  puedeCrearConRol,
  puedeGestionarConfigUsuarios,
  sucursalFiltroUsuarios,
} from "@/lib/services/configuracion-usuarios-service";
import { excluirCamposSensibles } from "@/lib/utils/sanitize";

// ── Constantes ─────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;
const MAX_POR_PAGINA = 100;

// ── Campos de selección estándar ──────────────────────────────────────────

const USUARIO_SELECT = {
  id: true,
  email: true,
  nombre: true,
  apellido: true,
  rut: true,
  iniciales: true,
  rol: true,
  sucursalId: true,
  activo: true,
  color: true,
  createdAt: true,
  updatedAt: true,
  sucursal: { select: { id: true, nombre: true, codigo: true } },
  especialidades: {
    select: {
      especialidad: { select: { id: true, nombre: true } },
    },
  },
} as const;

// ── GET — lista paginada ──────────────────────────────────────────────────

const listarQuerySchema = z.object({
  sucursalId: z.uuid().optional(),
  rol: z
    .enum(["ADMIN", "GERENTE_SUCURSAL", "JEFE_TALLER", "COORDINADOR", "TECNICO", "CONTROL_GESTION"])
    .optional(),
  activo: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  busqueda: z.string().min(1).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(MAX_POR_PAGINA).default(20),
});

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const parsed = listarQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { rol, activo, busqueda, pagina, porPagina } = parsed.data;
  const sucursalId = sucursalFiltroUsuarios(user.rol, user.sucursalId, parsed.data.sucursalId);

  const where = {
    ...(sucursalId ? { sucursalId } : {}),
    ...(rol ? { rol } : {}),
    ...(activo !== undefined ? { activo } : {}),
    ...(busqueda
      ? {
          OR: [
            { nombre: { contains: busqueda, mode: "insensitive" as const } },
            { apellido: { contains: busqueda, mode: "insensitive" as const } },
            { email: { contains: busqueda, mode: "insensitive" as const } },
            { rut: { contains: busqueda, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const skip = (pagina - 1) * porPagina;
  const [total, usuarios] = await Promise.all([
    prisma.usuario.count({ where }),
    prisma.usuario.findMany({
      where,
      skip,
      take: porPagina,
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
      select: {
        ...USUARIO_SELECT,
        // A09: último login incluye tanto sesiones web (LOGIN) como kiosco (PIN_LOGIN)
        auditoria: {
          where: { accion: { in: ["LOGIN", "PIN_LOGIN"] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
  ]);

  const data = usuarios.map(({ auditoria, ...u }) =>
    excluirCamposSensibles({
      ...u,
      ultimoLogin: auditoria[0]?.createdAt ?? null,
    })
  );

  return Response.json({
    data,
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
    porPagina,
  });
}

// ── POST — crear usuario ──────────────────────────────────────────────────

const crearUsuarioSchema = z.object({
  email: z.email("Email inválido"),
  nombre: z.string().min(1).max(100),
  apellido: z.string().min(1).max(100),
  rut: z.string().max(20).optional(),
  rol: z.enum([
    "ADMIN",
    "GERENTE_SUCURSAL",
    "JEFE_TALLER",
    "COORDINADOR",
    "TECNICO",
    "CONTROL_GESTION",
  ]),
  sucursalId: z.uuid(),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  pin: z
    .string()
    .length(4)
    .regex(/^\d{4}$/, "El PIN debe tener exactamente 4 dígitos")
    .optional(),
  color: z.string().optional(),
  iniciales: z.string().min(1).max(3).optional(),
  especialidadIds: z.array(z.uuid()).optional(),
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
  const parsed = crearUsuarioSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  if (!puedeCrearConRol(user.rol, data.rol)) {
    return Response.json(
      {
        error: `No puedes crear usuarios con rol ${data.rol}`,
      },
      { status: 403 }
    );
  }

  // JEFE_TALLER solo puede crear en su propia sucursal
  if (user.rol === "JEFE_TALLER" && data.sucursalId !== user.sucursalId) {
    return Response.json({ error: "No puedes crear usuarios en otra sucursal" }, { status: 403 });
  }

  // Validar unicidad — respuesta genérica (anti-enumeración):
  // No revelar qué campo específico está duplicado para evitar que un atacante
  // use este endpoint como oráculo para enumerar emails o RUTs existentes.
  const [emailExiste, rutExiste] = await Promise.all([
    prisma.usuario.findUnique({ where: { email: data.email }, select: { id: true } }),
    data.rut
      ? prisma.usuario.findUnique({ where: { rut: data.rut }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (emailExiste || rutExiste) {
    return Response.json(
      { error: "Los datos proporcionados ya están registrados en el sistema" },
      { status: 409 }
    );
  }

  // Verificar que la sucursal existe
  const sucursal = await prisma.sucursal.findUnique({
    where: { id: data.sucursalId },
    select: { id: true, activa: true },
  });
  if (!sucursal || !sucursal.activa) {
    return Response.json({ error: "Sucursal no encontrada o inactiva" }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const pinHash = data.pin ? await bcrypt.hash(data.pin, BCRYPT_ROUNDS) : null;

  const iniciales = data.iniciales ?? generarIniciales(data.nombre, data.apellido);
  const color = data.color ?? colorAleatorio();

  const usuario = await prisma.usuario.create({
    data: {
      email: data.email,
      passwordHash,
      nombre: data.nombre,
      apellido: data.apellido,
      rut: data.rut ?? null,
      iniciales,
      rol: data.rol,
      sucursal: { connect: { id: data.sucursalId } },
      pin: pinHash,
      color,
      activo: true,
      ...(data.especialidadIds && data.especialidadIds.length > 0
        ? {
            especialidades: {
              createMany: {
                data: data.especialidadIds.map((especialidadId) => ({
                  especialidadId,
                })),
                skipDuplicates: true,
              },
            },
          }
        : {}),
    },
    select: USUARIO_SELECT,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "CREAR_USUARIO",
    entidad: "Usuario",
    entidadId: usuario.id,
    datosNuevos: {
      email: usuario.email,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      rol: usuario.rol,
      sucursalId: usuario.sucursalId,
    },
    ip: getClientIp(request),
  });

  return Response.json({ usuario: excluirCamposSensibles(usuario) }, { status: 201 });
}
