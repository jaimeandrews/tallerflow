import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";
import type { CondicionAlerta } from "@/lib/services/alerta-service";

// ── Tipos de condición soportados ──────────────────────────────────────────

const CONDICIONES_SOPORTADAS: CondicionAlerta[] = [
  "tecnico_detenido",
  "of_sobre_sla",
  "tecnico_pausa_larga",
  "kiosco_inactivo",
];

const NIVELES_ALERTA = ["info", "warning", "critico"] as const;

const condicionSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("tecnico_detenido"),
    umbralMinutos: z.number().int().positive(),
  }),
  z.object({ tipo: z.literal("of_sobre_sla") }),
  z.object({
    tipo: z.literal("tecnico_pausa_larga"),
    umbralMinutos: z.number().int().positive(),
  }),
  z.object({
    tipo: z.literal("kiosco_inactivo"),
    umbralMinutos: z.number().int().positive(),
  }),
]);

// ── GET ────────────────────────────────────────────────────────────────────

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

  const { incluirInactivas } = parsed.data;
  const sucursalId = user.rol === "ADMIN" ? parsed.data.sucursalId : user.sucursalId;

  const ahora = new Date();
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  const reglas = await prisma.configuracionSLA.findMany({
    where: {
      ...(sucursalId ? { sucursalId } : {}),
      ...(incluirInactivas ? {} : { activa: true }),
    },
    orderBy: [{ sucursalId: "asc" }, { nombre: "asc" }],
    select: {
      id: true,
      sucursalId: true,
      nombre: true,
      descripcion: true,
      condicion: true,
      umbralMinutos: true,
      nivelAlerta: true,
      activa: true,
      createdAt: true,
      updatedAt: true,
      sucursal: { select: { id: true, nombre: true, codigo: true } },
      _count: { select: { alertas: true } },
      alertas: {
        where: { createdAt: { gte: inicioMes } },
        select: { id: true },
      },
    },
  });

  const data = reglas.map(({ _count, alertas, ...r }) => ({
    ...r,
    condicion: parseCondicion(r.condicion),
    totalAlertas: _count.alertas,
    alertasMes: alertas.length,
  }));

  return Response.json({ data, condicionesSoportadas: CONDICIONES_SOPORTADAS });
}

function parseCondicion(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { tipo: raw };
  }
}

// ── POST — crear regla ─────────────────────────────────────────────────────

const crearSchema = z.object({
  sucursalId: z.uuid(),
  nombre: z.string().min(1).max(200),
  descripcion: z.string().max(500).optional(),
  condicion: condicionSchema,
  umbralMinutos: z.number().int().positive(),
  nivelAlerta: z.enum(NIVELES_ALERTA),
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

  if (user.rol === "JEFE_TALLER" && data.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Solo puedes crear reglas para tu sucursal" }, { status: 403 });
  }

  const sucursal = await prisma.sucursal.findUnique({
    where: { id: data.sucursalId },
    select: { id: true },
  });
  if (!sucursal) {
    return Response.json({ error: "Sucursal no encontrada" }, { status: 404 });
  }

  const regla = await prisma.configuracionSLA.create({
    data: {
      sucursalId: data.sucursalId,
      nombre: data.nombre,
      descripcion: data.descripcion ?? null,
      condicion: data.condicion.tipo, // usamos el tipo como clave + umbralMinutos del objeto padre
      umbralMinutos: data.umbralMinutos,
      nivelAlerta: data.nivelAlerta,
      activa: true,
    },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "CREAR_REGLA_SLA",
    entidad: "ConfiguracionSLA",
    entidadId: regla.id,
    datosNuevos: {
      nombre: regla.nombre,
      condicion: data.condicion,
      umbralMinutos: regla.umbralMinutos,
      nivelAlerta: regla.nivelAlerta,
    },
    ip: getClientIp(request),
  });

  return Response.json({ regla: { ...regla, condicion: data.condicion } }, { status: 201 });
}
