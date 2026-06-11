/**
 * Route-level authorization helpers for Next.js App Router.
 *
 * Two usage styles are provided:
 *
 * 1. HOC wrappers — compose guards at export time:
 *    export const GET = withRole("ADMIN", "JEFE_TALLER")(async (req, ctx) => { ... })
 *
 * 2. Inline assertions — call inside the handler body:
 *    const user = await assertAuth(request);
 *    assertRole(user, "ADMIN");
 *
 * Both styles throw/return 401/403 Responses with a JSON body.
 * The HOC wrappers inject the resolved `AuthUser` into the context so
 * downstream handlers never need to call `getAuthUser` again.
 */

import type { NextRequest } from "next/server";
import type { RolUsuario } from "@/generated/prisma";
import { getAuthUser, getClientIp, type AuthUser } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";

// ── Shared types ──────────────────────────────────────────────────────────────

/** Handler context with auth user injected */
export interface AuthedContext<P extends Record<string, string> = Record<string, string>> {
  params: Promise<P>;
  user: AuthUser;
}

/** Raw handler context (no user yet) */
export type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>;
};

type RawHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  ctx: RouteContext<P>
) => Promise<Response>;

type AuthedHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  ctx: AuthedContext<P>
) => Promise<Response>;

// ── Canonical JSON error responses ────────────────────────────────────────────

export const UNAUTHORIZED = () => Response.json({ error: "No autorizado" }, { status: 401 });

export const FORBIDDEN = (message = "Sin permisos") =>
  Response.json({ error: message }, { status: 403 });

// ── A09: audit helper — log access denial ─────────────────────────────────────

function logAccesoDenegado(req: Request, user: AuthUser | null, motivo: string): void {
  void registrarAuditoria({
    usuarioId: user?.id,
    accion: "ACCESO_DENEGADO",
    entidad: "Auth",
    ip: getClientIp(req),
    datosNuevos: {
      ruta: new URL(req.url).pathname,
      metodo: req.method,
      rolUsuario: user?.rol ?? null,
      motivo,
    },
  });
}

// ── HOC: requireAuth ──────────────────────────────────────────────────────────

/**
 * Wraps a handler that needs an authenticated user.
 * Returns 401 if no session / invalid token.
 * Injects `ctx.user` for downstream use.
 *
 * @example
 * export const GET = requireAuth(async (req, { user }) => {
 *   return Response.json({ hola: user.nombre });
 * });
 */
export function requireAuth<P extends Record<string, string> = Record<string, string>>(
  handler: AuthedHandler<P>
): RawHandler<P> {
  return async (req, ctx) => {
    const user = await getAuthUser(req);
    if (!user) return UNAUTHORIZED();
    return handler(req, { ...ctx, user });
  };
}

// ── HOC: requireRole ──────────────────────────────────────────────────────────

/**
 * Curried guard: first accepts the allowed roles, then wraps a handler.
 * Returns 401 (no session) or 403 (wrong role).
 * Injects `ctx.user`.
 *
 * @example
 * export const DELETE = requireRole("ADMIN")(async (req, { user }) => { ... });
 * export const GET = requireRole("ADMIN", "JEFE_TALLER")(handler);
 */
export function requireRole<P extends Record<string, string> = Record<string, string>>(
  ...roles: RolUsuario[]
) {
  return (handler: AuthedHandler<P>): RawHandler<P> =>
    async (req, ctx) => {
      const user = await getAuthUser(req);
      if (!user) return UNAUTHORIZED();
      if (!roles.includes(user.rol)) {
        logAccesoDenegado(req, user, `rol ${user.rol} no está en [${roles.join(", ")}]`);
        return FORBIDDEN();
      }
      return handler(req, { ...ctx, user });
    };
}

// ── HOC: requireSucursal ──────────────────────────────────────────────────────

/**
 * Extends requireAuth: additionally injects `ctx.user.sucursalId` and
 * validates it is non-empty (should always be true, but guards against
 * malformed tokens).
 *
 * Use this when the handler MUST operate within the user's sucursal context.
 *
 * @example
 * export const GET = requireSucursal(async (req, { user }) => {
 *   const data = await prisma.turno.findMany({ where: { sucursalId: user.sucursalId } });
 *   return Response.json({ data });
 * });
 */
export function requireSucursal<P extends Record<string, string> = Record<string, string>>(
  handler: AuthedHandler<P>
): RawHandler<P> {
  return async (req, ctx) => {
    const user = await getAuthUser(req);
    if (!user) return UNAUTHORIZED();
    if (!user.sucursalId) {
      return Response.json(
        { error: "Token sin sucursalId — contacta al administrador" },
        { status: 403 }
      );
    }
    return handler(req, { ...ctx, user });
  };
}

// ── HOC: requireOwnership ─────────────────────────────────────────────────────

/**
 * Verifies that the authenticated user owns the resource identified by the
 * route params, or that they are an ADMIN (who can access any resource).
 *
 * `getOwnerId` receives the resolved route params and should return:
 *   - The owner's userId (string) → checked against user.id
 *   - null → resource not found, returns 404
 *
 * @example
 * // Only the marcaje owner (or ADMIN) can finalize it
 * export const PATCH = requireOwnership(
 *   async (req, { user, params }) => { ... },
 *   async ({ id }) => {
 *     const m = await prisma.marcaje.findUnique({ where: { id }, select: { usuarioId: true } });
 *     return m?.usuarioId ?? null;
 *   },
 * );
 */
export function requireOwnership<P extends Record<string, string> = Record<string, string>>(
  handler: AuthedHandler<P>,
  getOwnerId: (params: P) => Promise<string | null>
): RawHandler<P> {
  return async (req, ctx) => {
    const user = await getAuthUser(req);
    if (!user) return UNAUTHORIZED();

    const params = await ctx.params;
    const ownerId = await getOwnerId(params);

    if (ownerId === null) {
      return Response.json({ error: "Recurso no encontrado" }, { status: 404 });
    }
    if (user.rol !== "ADMIN" && ownerId !== user.id) {
      logAccesoDenegado(req, user, `recurso pertenece a ${ownerId}, usuario es ${user.id}`);
      return FORBIDDEN("No tienes permisos sobre este recurso");
    }

    return handler(req, { ...ctx, user });
  };
}

// ── Inline assertions (use inside handlers) ───────────────────────────────────

/**
 * Asserts the request has a valid session.
 * Returns the AuthUser on success.
 * Returns a 401 Response on failure — caller must return it immediately.
 *
 * @example
 * const authResult = await assertAuth(request);
 * if (authResult instanceof Response) return authResult;
 * const user = authResult; // AuthUser
 */
export async function assertAuth(request: Request): Promise<AuthUser | Response> {
  const user = await getAuthUser(request);
  if (!user) return UNAUTHORIZED();
  return user;
}

/**
 * Asserts the user has one of the required roles.
 * Returns a 403 Response if not, or null if OK.
 *
 * @example
 * const roleErr = assertRole(user, "ADMIN", "JEFE_TALLER");
 * if (roleErr) return roleErr;
 */
export function assertRole(user: AuthUser, ...roles: RolUsuario[]): Response | null;
export function assertRole(user: AuthUser, req: Request, ...roles: RolUsuario[]): Response | null;
export function assertRole(
  user: AuthUser,
  reqOrRole: Request | RolUsuario,
  ...rest: RolUsuario[]
): Response | null {
  // Overload resolution: second arg is a Request if it has .url
  const hasReq = typeof reqOrRole === "object" && "url" in reqOrRole;
  const req = hasReq ? (reqOrRole as Request) : null;
  const roles = hasReq ? rest : [reqOrRole as RolUsuario, ...rest];

  if (!roles.includes(user.rol)) {
    if (req) logAccesoDenegado(req, user, `rol ${user.rol} no está en [${roles.join(", ")}]`);
    return FORBIDDEN();
  }
  return null;
}

/**
 * Asserts the user belongs to the given sucursal, or is ADMIN.
 * Returns a 403 Response if not. Pass `request` to log the denial.
 */
export function assertSucursal(
  user: AuthUser,
  resourceSucursalId: string,
  messageOrReq?: string | Request
): Response | null {
  if (user.rol === "ADMIN") return null;
  if (user.sucursalId !== resourceSucursalId) {
    const req = messageOrReq instanceof Request ? messageOrReq : null;
    const message =
      typeof messageOrReq === "string" ? messageOrReq : "Sin permisos sobre este recurso";
    if (req) logAccesoDenegado(req, user, `sucursal ${user.sucursalId} ≠ ${resourceSucursalId}`);
    return FORBIDDEN(message);
  }
  return null;
}

/**
 * Asserts the user is the owner of a resource (or ADMIN).
 * Returns a 403 Response if not. Pass `request` to log the denial.
 */
export function assertOwner(
  user: AuthUser,
  ownerId: string,
  messageOrReq?: string | Request
): Response | null {
  if (user.rol === "ADMIN") return null;
  if (user.id !== ownerId) {
    const req = messageOrReq instanceof Request ? messageOrReq : null;
    const message =
      typeof messageOrReq === "string" ? messageOrReq : "No tienes permisos sobre este recurso";
    if (req) logAccesoDenegado(req, user, `recurso pertenece a ${ownerId}, usuario es ${user.id}`);
    return FORBIDDEN(message);
  }
  return null;
}
