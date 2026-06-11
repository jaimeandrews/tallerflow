import { type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import {
  puedeCrearConRol,
  puedeGestionarConfigUsuarios,
} from "@/lib/services/configuracion-usuarios-service";
import { inicioDelDia } from "@/lib/services/dashboard-service";
import { excluirCamposSensibles } from "@/lib/utils/sanitize";

const BCRYPT_ROUNDS = 10;

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
    select: { especialidad: { select: { id: true, nombre: true } } },
  },
} as const;

// ── Verificar acceso al usuario ────────────────────────────────────────────

async function verificarAcceso(userId: string, userRol: string, userSucursalId: string) {
  const target = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { id: true, sucursalId: true, rol: true, activo: true },
  });
  if (!target) return null;
  if (userRol !== "ADMIN" && target.sucursalId !== userSucursalId) return null;
  return target;
}

// ── GET — detalle con estadísticas ────────────────────────────────────────

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const target = await verificarAcceso(id, user.rol, user.sucursalId);
  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const [usuario, totalMarcajes, ultimoMarcaje, marcajesMes] = await Promise.all([
    prisma.usuario.findUnique({ where: { id }, select: USUARIO_SELECT }),
    prisma.marcaje.count({ where: { usuarioId: id } }),
    prisma.marcaje.findFirst({
      where: { usuarioId: id },
      orderBy: { horaInicio: "desc" },
      select: { horaInicio: true, actividad: { select: { nombre: true } } },
    }),
    prisma.marcaje.findMany({
      where: {
        usuarioId: id,
        horaInicio: { gte: inicioMes },
        horaFin: { not: null },
        duracionMinutos: { not: null },
      },
      select: {
        duracionMinutos: true,
        actividad: { select: { productiva: true } },
      },
    }),
  ]);

  if (!usuario) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  let hhTotalMes = 0;
  let hhProductivasMes = 0;
  for (const m of marcajesMes) {
    const hh = (m.duracionMinutos ?? 0) / 60;
    hhTotalMes += hh;
    if (m.actividad.productiva) hhProductivasMes += hh;
  }
  const productividadMes = hhTotalMes > 0 ? Math.round((hhProductivasMes / hhTotalMes) * 100) : 0;

  return Response.json({
    usuario: excluirCamposSensibles(usuario),
    estadisticas: {
      totalMarcajes,
      ultimoMarcaje: ultimoMarcaje
        ? {
            horaInicio: ultimoMarcaje.horaInicio.toISOString(),
            actividad: ultimoMarcaje.actividad.nombre,
          }
        : null,
      hhTotalMes: Math.round(hhTotalMes * 10) / 10,
      productividadMes,
    },
  });
}

// ── PUT — actualizar ──────────────────────────────────────────────────────

const actualizarUsuarioSchema = z
  .object({
    email: z.email().optional(),
    nombre: z.string().min(1).max(100).optional(),
    apellido: z.string().min(1).max(100).optional(),
    rut: z.string().max(20).optional(),
    iniciales: z.string().min(1).max(3).optional(),
    rol: z
      .enum([
        "ADMIN",
        "GERENTE_SUCURSAL",
        "JEFE_TALLER",
        "COORDINADOR",
        "TECNICO",
        "CONTROL_GESTION",
      ])
      .optional(),
    sucursalId: z.uuid().optional(),
    password: z.string().min(6).optional(),
    pin: z
      .string()
      .length(4)
      .regex(/^\d{4}$/)
      .optional(),
    color: z.string().optional(),
    especialidadIds: z.array(z.uuid()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Debe proporcionar al menos un campo para actualizar",
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
  const target = await verificarAcceso(id, user.rol, user.sucursalId);
  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = actualizarUsuarioSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Un usuario no puede cambiar su propio rol
  if (data.rol && id === user.id && data.rol !== target.rol) {
    return Response.json({ error: "No puedes cambiar tu propio rol" }, { status: 403 });
  }

  // Verificar que puede asignar el nuevo rol al target
  if (data.rol && !puedeCrearConRol(user.rol, data.rol)) {
    return Response.json({ error: `No puedes asignar el rol ${data.rol}` }, { status: 403 });
  }

  // Unicidad de email y rut — respuesta genérica (anti-enumeración)
  if (data.email || data.rut) {
    const [emailExiste, rutExiste] = await Promise.all([
      data.email
        ? prisma.usuario.findFirst({
            where: { email: data.email, id: { not: id } },
            select: { id: true },
          })
        : Promise.resolve(null),
      data.rut
        ? prisma.usuario.findFirst({
            where: { rut: data.rut, id: { not: id } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (emailExiste || rutExiste) {
      return Response.json(
        { error: "Los datos proporcionados ya están registrados en el sistema" },
        { status: 409 }
      );
    }
  }
  const { password, pin, especialidadIds, ...camposSimples } = data;

  const updateData: Record<string, unknown> = { ...camposSimples };
  if (password) updateData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  if (pin) updateData.pin = await bcrypt.hash(pin, BCRYPT_ROUNDS);

  const usuarioAnterior = await prisma.usuario.findUnique({
    where: { id },
    select: {
      email: true,
      nombre: true,
      apellido: true,
      rol: true,
      sucursalId: true,
      color: true,
      activo: true,
    },
  });

  // Actualizar especialidades si se proveen
  if (especialidadIds) {
    await prisma.usuarioEspecialidad.deleteMany({
      where: { usuarioId: id },
    });
    if (especialidadIds.length > 0) {
      await prisma.usuarioEspecialidad.createMany({
        data: especialidadIds.map((especialidadId) => ({
          usuarioId: id,
          especialidadId,
        })),
        skipDuplicates: true,
      });
    }
  }

  const usuario = await prisma.usuario.update({
    where: { id },
    data: updateData,
    select: USUARIO_SELECT,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ACTUALIZAR_USUARIO",
    entidad: "Usuario",
    entidadId: id,
    datosAnteriores: usuarioAnterior ?? undefined,
    datosNuevos: {
      ...camposSimples,
      passwordCambiada: !!password,
      pinCambiado: !!pin,
    },
    ip: getClientIp(request),
  });

  return Response.json({ usuario: excluirCamposSensibles(usuario) });
}
