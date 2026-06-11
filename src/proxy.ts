/**
 * Next.js Edge Middleware (proxy.ts — NextAuth v5 convention for this project).
 *
 * Responsibilities:
 * 1. Auth guard: redirect unauthenticated users to /login.
 * 2. A07 — Rate-limit the NextAuth credentials callback to mitigate brute-force
 *    on the email+password login form. The PIN endpoint has its own route-level
 *    rate-limiter with escalating blocks.
 * 3. A05 — Cache-Control: no-store on all /api/* responses so sensitive data is
 *    never cached by CDN / reverse proxies.
 * 4. CSRF — Validate Origin / Referer for API mutation requests that carry a
 *    session cookie. SameSite=Lax is the primary defence; this is defense-in-depth
 *    for older browsers and non-standard clients.
 *
 * Edge runtime: no Node.js built-ins. The in-process RL counter resets on cold
 * start. For multi-instance ECS Fargate scale-out, replace with an edge KV
 * store (e.g. Upstash Redis).
 */

import { auth } from "@/lib/auth/auth";
import { NextResponse } from "next/server";
import { isCsrfValid } from "@/lib/middleware/csrf";

// ── In-process rate limit (login form — Edge-compatible) ──────────────────────

interface RLWindow {
  count: number;
  resetAt: number;
}
const loginWindows = new Map<string, RLWindow>();

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const MAX = 10;
  const WINDOW = 60_000;
  const now = Date.now();

  const w = loginWindows.get(ip);
  if (!w || now > w.resetAt) {
    loginWindows.set(ip, { count: 1, resetAt: now + WINDOW });
    return { allowed: true };
  }
  if (w.count >= MAX) {
    return { allowed: false, retryAfter: Math.ceil((w.resetAt - now) / 1000) };
  }
  w.count++;
  return { allowed: true };
}

// ── Middleware ─────────────────────────────────────────────────────────────────

export default auth((req) => {
  const pathname = req.nextUrl.pathname;
  const method = req.method ?? "GET";
  const isLoggedIn = !!req.auth;

  // A07: Rate-limit POST to NextAuth credentials callback
  if (pathname === "/api/auth/callback/credentials" && method === "POST") {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const { allowed, retryAfter } = checkLoginRateLimit(ip);
    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Demasiados intentos. Espera un momento antes de reintentar." }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": String(retryAfter ?? 60) },
        }
      );
    }
  }

  // CSRF: validate Origin / Referer for API mutations
  if (pathname.startsWith("/api/")) {
    if (!isCsrfValid({ method, url: req.url, headers: req.headers, cookies: req.cookies })) {
      return new NextResponse(
        JSON.stringify({ error: "CSRF check failed. Origin no permitido." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // A05: Prevent API responses from being cached by CDN / reverse proxies
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return response;
  }

  // Auth guard: redirect unauthenticated requests to /login
  const publicPaths = ["/login", "/api/"];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (!isLoggedIn && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
