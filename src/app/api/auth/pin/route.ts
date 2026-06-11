import { type NextRequest } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import {
  checkRateLimit,
  recordFailureAndMaybeBlock,
  clearFailures,
} from "@/lib/middleware/rate-limit";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { generatePinToken, getClientIp } from "@/lib/auth/api-auth";

// A07 / Enumeración: hash dummy pre-computado para normalizar el tiempo de
// respuesta cuando ningún técnico de la sucursal tiene PIN configurado.
// Hardcoded (bcrypt cost=10) — equivalente a `await bcrypt.hash("dummy", 10)`
// sin el overhead async en cada arranque del servidor.
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const schema = z.object({
  pin: z
    .string()
    .length(4, "El PIN debe tener exactamente 4 dígitos")
    .regex(/^\d+$/, "El PIN solo debe contener números"),
  sucursalId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rlKey = `pin:${ip}`;

  // Short-window throttle (10 req / 1 min)
  const rl = checkRateLimit(rlKey, 10, 60 * 1000);
  if (!rl.allowed) {
    void registrarAuditoria({
      accion: "PIN_BLOQUEADO",
      entidad: "Auth",
      ip,
      datosNuevos: { reason: rl.reason ?? "rate-limit", level: "SEGURIDAD" },
    });
    return Response.json(
      {
        error: rl.reason ?? "Demasiados intentos. Intente en unos minutos.",
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { pin, sucursalId } = parsed.data;

  // Verify sucursal exists and is active
  const sucursal = await prisma.sucursal.findFirst({
    where: { id: sucursalId, activa: true },
    select: { id: true },
  });
  if (!sucursal) {
    return Response.json({ error: "Sucursal inválida" }, { status: 400 });
  }

  const usuarios = await prisma.usuario.findMany({
    where: { sucursalId, pin: { not: null }, activo: true },
    select: {
      id: true,
      email: true,
      nombre: true,
      apellido: true,
      iniciales: true,
      rol: true,
      sucursalId: true,
      color: true,
      pin: true,
    },
  });

  let matchedUser: (typeof usuarios)[0] | null = null;
  for (const u of usuarios) {
    if (u.pin && (await bcrypt.compare(pin, u.pin))) {
      matchedUser = u;
      break;
    }
  }

  // A07 — timing normalization: if no users in this sucursal have a PIN, the
  // loop above runs in ~0 ms (no bcrypt). An attacker could distinguish
  // "sucursal has PIN users" (slow ~100ms) from "no PIN users" (fast <1ms).
  // Run one dummy compare to equalize both paths to ~100ms.
  if (!matchedUser && usuarios.length === 0) {
    await bcrypt.compare(pin, DUMMY_HASH);
  }

  if (!matchedUser) {
    const block = recordFailureAndMaybeBlock(rlKey);

    void registrarAuditoria({
      accion: block ? "PIN_BLOQUEO_APLICADO" : "PIN_INVALIDO",
      entidad: "Auth",
      ip,
      datosNuevos: {
        sucursalId,
        level: block ? "SEGURIDAD" : "INFO",
        block: block ? block.reason : undefined,
      },
    });

    if (block) {
      return Response.json(
        { error: block.reason },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((block.blockedUntil - Date.now()) / 1000)) },
        }
      );
    }

    return Response.json({ error: "PIN inválido" }, { status: 401 });
  }

  // Success: clear failure history for this IP
  clearFailures(rlKey);

  // Minimal JWT payload — NEVER include pin, passwordHash, email, apellido, color
  const { token, jti, expiresAt } = await generatePinToken({
    id: matchedUser.id,
    nombre: matchedUser.nombre,
    iniciales: matchedUser.iniciales,
    rol: matchedUser.rol,
    sucursalId: matchedUser.sucursalId,
  });

  void registrarAuditoria({
    usuarioId: matchedUser.id,
    accion: "PIN_LOGIN",
    entidad: "Auth",
    ip,
    datosNuevos: { sucursalId },
  });

  return Response.json({
    token,
    jti, // returned so the client can pass it back on explicit logout
    expiresAt, // Unix ms — client uses it to show session expiry
    user: {
      id: matchedUser.id,
      nombre: matchedUser.nombre,
      apellido: matchedUser.apellido,
      iniciales: matchedUser.iniciales,
      rol: matchedUser.rol,
      sucursalId: matchedUser.sucursalId,
      color: matchedUser.color,
    },
  });
}
