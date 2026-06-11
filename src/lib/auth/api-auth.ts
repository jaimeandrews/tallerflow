import { auth } from "@/lib/auth/auth";
import { decode, encode } from "@auth/core/jwt";
import { prisma } from "@/lib/db/prisma";
import type { RolUsuario } from "@/generated/prisma";
import { randomUUID } from "node:crypto";

// A02: fail fast if the secret is missing or too short.
// This check runs once at module load time (server startup).
if (process.env.NODE_ENV === "production") {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error(
      "[SECURITY] AUTH_SECRET must be at least 32 characters in production. " +
        "Generate one with: openssl rand -base64 32"
    );
  }
}

export interface AuthUser {
  id: string;
  nombre: string;
  iniciales: string;
  rol: RolUsuario;
  sucursalId: string;
  // Optional fields — present from NextAuth session, absent from Bearer JWT (PIN kiosco)
  apellido?: string;
  color?: string;
  email?: string;
}

// Salt used by NextAuth for session tokens (also reused for our PIN-issued JWT)
const JWT_SALT = "authjs.session-token";

// ── Token denylist (A04 — kiosco explicit logout) ─────────────────────────────
//
// When a kiosco session ends (auto-logout by inactivity or manual PIN change),
// the Bearer JWT is added to this denylist so it's rejected even before it
// naturally expires (8 hours / one shift). The denylist is keyed by the token's
// `jti` claim and entries self-expire so memory doesn't grow unbounded.
//
// Limitation: in-process only — a multi-instance deployment (ECS Fargate) would
// need a shared store (Redis / DynamoDB). Acceptable for the current single-
// instance architecture. Document in DEPLOYMENT.md if scaling.
const tokenDenylist = new Map<string, number>(); // jti → expiry timestamp (ms)

function isDenied(jti: string): boolean {
  const expiry = tokenDenylist.get(jti);
  if (expiry === undefined) return false;
  if (Date.now() > expiry) {
    tokenDenylist.delete(jti); // self-clean expired entries
    return false;
  }
  return true;
}

/** Invalidate a kiosco Bearer token by its JTI. */
export function revocarTokenKiosco(jti: string, expiryMs: number): void {
  tokenDenylist.set(jti, expiryMs);
}

// ── Active-user cache (60 s TTL) ──────────────────────────────────────────────
// Avoids hitting the DB on every API call from the kiosk.
const activeUserCache = new Map<string, number>(); // userId → expiry timestamp
const ACTIVE_CACHE_TTL = 60 * 1000; // 60 s

async function isUserActive(userId: string): Promise<boolean> {
  const now = Date.now();
  const cached = activeUserCache.get(userId);
  if (cached && cached > now) return true;

  const u = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { activo: true },
  });
  if (u?.activo) {
    activeUserCache.set(userId, now + ACTIVE_CACHE_TTL);
    return true;
  }
  activeUserCache.delete(userId);
  return false;
}

// ── Token generation (PIN / kiosco) ──────────────────────────────────────────

// Minimal payload — NO pin, NO passwordHash, NO email, NO apellido.
// jti added for denylist-based revocation.
export interface PinTokenPayload {
  id: string;
  nombre: string;
  iniciales: string;
  rol: RolUsuario;
  sucursalId: string;
  jti: string; // JWT ID — used to revoke the token on explicit logout
}

export async function generatePinToken(payload: Omit<PinTokenPayload, "jti">): Promise<{
  token: string;
  jti: string;
  expiresAt: number;
}> {
  const jti = randomUUID();
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
  const token = await encode({
    token: { ...payload, jti },
    secret: process.env.AUTH_SECRET!,
    maxAge: 8 * 60 * 60, // 8 hours (one shift)
    salt: JWT_SALT,
  });
  return { token, jti, expiresAt };
}

// ── Auth resolution ───────────────────────────────────────────────────────────

export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  // Try NextAuth session first (reads from cookies automatically)
  const session = await auth();
  if (session?.user?.id) {
    return session.user as AuthUser;
  }

  // Try Bearer token (kiosk mode — issued by /api/auth/pin)
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const decoded = await decode({
        token,
        secret: process.env.AUTH_SECRET!,
        salt: JWT_SALT,
      });
      const d = decoded as Record<string, unknown> | null;
      if (!d?.id) return null;

      // A04: check denylist — token explicitly logged out
      const jti = d.jti as string | undefined;
      if (jti && isDenied(jti)) return null;

      // Invalidate token if user has been deactivated
      const active = await isUserActive(d.id as string);
      if (!active) return null;

      return {
        id: d.id as string,
        nombre: (d.nombre as string) ?? "",
        iniciales: (d.iniciales as string) ?? "",
        rol: d.rol as RolUsuario,
        sucursalId: d.sucursalId as string,
      };
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Invalida la caché de actividad de un usuario para que la próxima request
 * Bearer fuerce re-consulta a la BD y detecte activo=false.
 *
 * Sesiones NextAuth web (JWT stateless) no se invalidan aquí — expiran en
 * ~8 h (maxAge en auth.ts). Para invalidación inmediata en web se requiere
 * blacklist externo (Redis). Se acepta esta ventana como trade-off para el MVP.
 */
export function invalidarCacheUsuario(userId: string): void {
  activeUserCache.delete(userId);
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
