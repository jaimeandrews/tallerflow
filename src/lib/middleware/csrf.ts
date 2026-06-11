/**
 * CSRF protection for custom API mutation routes.
 *
 * Primary defense (already in place):
 *   - Session cookies use SameSite=Lax → browsers don't send them on cross-origin
 *     POST/PUT/PATCH/DELETE, so modern browsers cannot be used for CSRF.
 *
 * Defense-in-depth (this module):
 *   - Validates the Origin (or Referer) header for every mutation that carries
 *     a session cookie, protecting older browsers that don't enforce SameSite.
 *   - Bearer token requests (kiosco) are explicitly exempt — they're not
 *     cookie-based, so CSRF doesn't apply.
 *   - NextAuth's own endpoints (/api/auth/*) manage CSRF internally.
 *
 * Integration: called from proxy.ts (Edge runtime — no Prisma/Node built-ins).
 */

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Extract the expected origin from NEXTAUTH_URL or AUTH_URL env vars. */
function expectedOrigin(): string {
  const raw = process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "";
  try {
    return new URL(raw).origin; // "https://app.tallerflow.cl" (no trailing slash)
  } catch {
    return raw;
  }
}

/** Returns true if the request origin is acceptable for the current environment. */
function originAllowed(candidate: string, expected: string): boolean {
  if (expected && candidate === expected) return true;
  // Allow localhost in all non-production environments (dev + test)
  if (process.env.NODE_ENV !== "production") {
    return (
      candidate.startsWith("http://localhost:") ||
      candidate.startsWith("http://127.0.0.1:") ||
      candidate === "http://localhost" ||
      candidate === "http://127.0.0.1"
    );
  }
  return false;
}

export interface CsrfCheckRequest {
  method: string | undefined;
  url: string;
  headers: { get(name: string): string | null };
  cookies: { has(name: string): boolean };
}

/**
 * Returns `true` if the request passes the CSRF check, `false` if it should
 * be rejected with 403.
 *
 * Decision tree:
 *  1. Non-mutation method?              → allow (GET/HEAD/OPTIONS are safe)
 *  2. Bearer Authorization header?      → allow (not cookie-based)
 *  3. /api/auth/* path?                 → allow (NextAuth handles CSRF itself)
 *  4. Origin header present?            → allow only if it matches expected origin
 *  5. Referer header present?           → allow only if it starts with expected origin
 *  6. Neither Origin nor Referer        → allow only if no session cookie is set
 *                                          (server-to-server calls have no cookies)
 */
export function isCsrfValid(req: CsrfCheckRequest): boolean {
  const method = (req.method ?? "GET").toUpperCase();

  // 1. Non-mutation → always safe
  if (!MUTATION_METHODS.has(method)) return true;

  // 2. Bearer token (kiosco PIN auth) → CSRF not applicable
  if (req.headers.get("authorization")?.startsWith("Bearer ")) return true;

  // 3. NextAuth's own endpoints → skip (they use their own CSRF tokens)
  try {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith("/api/auth/")) return true;
  } catch {
    return false; // malformed URL
  }

  const expected = expectedOrigin();
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // 4. Origin present → validate
  if (origin) {
    return originAllowed(origin, expected);
  }

  // 5. Referer present → validate
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin;
      return originAllowed(refOrigin, expected);
    } catch {
      return false;
    }
  }

  // 6. No origin signal → only allow if no session cookie (server-to-server call)
  const hasSession =
    req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
  return !hasSession;
}
