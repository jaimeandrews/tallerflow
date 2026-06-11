import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";

const NIVELES_ALERTA = ["info", "warning", "critico"] as const;

const updateSchema = z
  .object({
    nombre: z.string().min(1).max(200).optional(),
    descripcion: z.string().max(500).nullable().optional(),
    condicion: z
      .enum(["tecnico_detenido", "of_sobre_sla", "tecnico_pausa_larga", "kiosco_inactivo"])
      .optional(),
    umbralMinutos: z.number().int().positive().optional(),
    nivelAlerta: z.enum(NIVELES_ALERTA).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Debe proporcionar al menos un campo",
  });

async function resolverRegla(id: string, userRol: string, userSucursalId: string) {
  const r = await prisma.configuracionSLA.findUnique({
    where: { id },
    select: {
      id: true,
      sucursalId: true,
      nombre: true,
      descripcion: true,
      condicion: true,
      umbralMinutos: true,
      nivelAlerta: true,
      activa: true,
    },
  });
  if (!r) return null;
  if (userRol === "JEFE_TALLER" && r.sucursalId !== userSucursalId) return null;
  return r;
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
  const reglaActual = await resolverRegla(id, user.rol, user.sucursalId);
  if (!reglaActual) {
    return Response.json({ error: "Regla SLA no encontrada" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const regla = await prisma.configuracionSLA.update({
    where: { id },
    data: parsed.data,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ACTUALIZAR_REGLA_SLA",
    entidad: "ConfiguracionSLA",
    entidadId: id,
    datosAnteriores: {
      nombre: reglaActual.nombre,
      condicion: reglaActual.condicion,
      umbralMinutos: reglaActual.umbralMinutos,
      nivelAlerta: reglaActual.nivelAlerta,
    },
    datosNuevos: parsed.data,
    ip: getClientIp(request),
  });

  return Response.json({ regla });
}
