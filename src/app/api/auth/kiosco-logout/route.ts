/**
 * POST /api/auth/kiosco-logout
 *
 * Called by the kiosco client on explicit logout (manual or auto-logout by
 * inactivity). Adds the token's JTI to the server-side denylist so the Bearer
 * token is rejected immediately, even though the JWT hasn't expired yet.
 *
 * Body: { jti: string; expiresAt: number }
 *  - jti: the JWT ID returned by /api/auth/pin at login
 *  - expiresAt: Unix timestamp (ms) — tells the server when to auto-expire the
 *    denylist entry (no manual cleanup needed)
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthUser, getClientIp, revocarTokenKiosco } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";

const schema = z.object({
  jti: z.string().uuid(),
  expiresAt: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  // The token being revoked must still be valid to authenticate this request
  // (prevents anyone from revoking arbitrary tokens).
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { jti, expiresAt } = parsed.data;

  // Only revoke tokens that haven't already passed their natural expiry
  if (expiresAt < Date.now()) {
    return Response.json({ ok: true, note: "Token ya expirado" });
  }

  revocarTokenKiosco(jti, expiresAt);

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "KIOSCO_LOGOUT",
    entidad: "Auth",
    ip: getClientIp(request),
    datosNuevos: { jti: jti.slice(0, 8) + "…" }, // log only prefix, not full JTI
  });

  return Response.json({ ok: true });
}
