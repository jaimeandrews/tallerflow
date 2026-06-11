import { type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarConfigUsuarios } from "@/lib/services/configuracion-usuarios-service";

const BCRYPT_ROUNDS = 10;

const schema = z.object({
  nuevoPin: z
    .string()
    .length(4, "El PIN debe tener exactamente 4 dígitos")
    .regex(/^\d{4}$/, "El PIN debe contener solo dígitos"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!puedeGestionarConfigUsuarios(user.rol)) {
    return Response.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.usuario.findUnique({
    where: { id },
    select: { id: true, sucursalId: true, nombre: true, apellido: true },
  });

  if (!target) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (user.rol === "JEFE_TALLER" && target.sucursalId !== user.sucursalId) {
    return Response.json({ error: "Usuario de otra sucursal" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const pinHash = await bcrypt.hash(parsed.data.nuevoPin, BCRYPT_ROUNDS);

  // A02: select { id } only — avoids returning the new pin hash from the DB response
  await prisma.usuario.update({
    where: { id },
    data: { pin: pinHash },
    select: { id: true },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "RESET_PIN",
    entidad: "Usuario",
    entidadId: id,
    // Nunca loggear el PIN en texto plano ni el hash
    datosNuevos: { pinReseteado: true },
    ip: getClientIp(request),
  });

  return Response.json({ ok: true });
}
