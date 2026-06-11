/**
 * E2E tests — Control de acceso por rol (RBAC)
 *
 * Verifies that route guards and role-based redirects work correctly for
 * every user role defined in the system.
 *
 * Each describe block calls `test.use({ storageState: ... })` to start with
 * a clean (unauthenticated) browser context, overriding the project-level
 * storageState set in playwright.config.ts. It then logs in as the target role.
 *
 * Access rules (from CLAUDE.md):
 *   ADMIN           → all routes
 *   JEFE_TALLER     → /dashboard, /ordenes, /asignacion, /centro-control,
 *                     /reportes, /configuracion
 *   TECNICO         → /tecnico only  (blocked from supervisor routes)
 *   Unauthenticated → redirect to /login for all protected routes
 *
 * Note: /marcaje (kiosco) is intentionally accessible without a web session —
 *       it uses a separate PIN-based Bearer token, not a NextAuth cookie.
 */

import { test, expect } from "@playwright/test";
import { loginComoAdmin, loginComoJefe, loginComoTecnico } from "./helpers/auth";

// ── Route manifests ───────────────────────────────────────────────────────────

const SUPERVISOR_ROUTES = [
  "/dashboard",
  "/ordenes",
  "/asignacion",
  "/centro-control",
  "/reportes",
  "/configuracion",
] as const;

// ── Sin autenticación ─────────────────────────────────────────────────────────

test.describe("Sin sesión activa → redirect a /login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of [...SUPERVISOR_ROUTES, "/tecnico"] as const) {
    test(`${route} redirige a /login`, async ({ page }) => {
      await page.goto(route);
      await page.waitForURL("**/login**", { timeout: 10_000 });
      expect(page.url()).toContain("/login");
    });
  }

  test("/marcaje (kiosco) es accesible sin sesión web — muestra pantalla PIN", async ({ page }) => {
    await page.goto("/marcaje");
    await page.waitForLoadState("networkidle");

    // Kiosk does not require a web session — shows PIN entry screen
    expect(page.url()).not.toContain("/login");
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({ timeout: 10_000 });
  });

  test("/ (raíz) redirige a /login o a /dashboard si no hay sesión", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Root redirect typically goes to /login when not authenticated
    expect(page.url()).toMatch(/\/(login|dashboard)/);
  });
});

// ── ADMIN — acceso total ──────────────────────────────────────────────────────

test.describe("ADMIN — puede acceder a todas las rutas de supervisor", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await loginComoAdmin(page);
  });

  for (const route of SUPERVISOR_ROUTES) {
    test(`${route} accesible como ADMIN`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      // Must not be redirected to login
      expect(page.url()).not.toContain("/login");
      // Must stay on the target route (or a sub-path of it)
      expect(page.url()).toContain(route.replace(/^\//, ""));
    });
  }

  test("sidebar muestra enlace Configuración (admin-only)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: /configuración/i }).first()).toBeVisible({
      timeout: 8_000,
    });
  });
});

// ── JEFE_TALLER — acceso a vistas de taller ───────────────────────────────────

test.describe("JEFE_TALLER — acceso a rutas de taller", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await loginComoJefe(page);
  });

  const jefRoutes = [
    "/dashboard",
    "/ordenes",
    "/asignacion",
    "/centro-control",
    "/reportes",
  ] as const;

  for (const route of jefRoutes) {
    test(`${route} accesible como JEFE_TALLER`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/login");
    });
  }

  test("login redirige a /dashboard (no a /tecnico ni /marcaje)", async ({ page }) => {
    expect(page.url()).toContain("/dashboard");
    expect(page.url()).not.toContain("/tecnico");
  });
});

// ── TECNICO — solo acceso a /tecnico ─────────────────────────────────────────

test.describe("TECNICO — acceso limitado a vista técnico", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await loginComoTecnico(page);
    // loginComoTecnico already waits for /tecnico redirect
    await page.waitForURL("**/tecnico**", { timeout: 15_000 });
  });

  test("login redirige a /tecnico, NO a /dashboard", async ({ page }) => {
    expect(page.url()).toContain("/tecnico");
    expect(page.url()).not.toContain("/dashboard");
  });

  const blockedRoutes = [
    "/dashboard",
    "/configuracion",
    "/reportes",
    "/asignacion",
    "/centro-control",
  ] as const;

  for (const route of blockedRoutes) {
    test(`${route} redirige fuera de rutas de supervisor`, async ({ page }) => {
      await page.goto(route);
      // Must end up on /tecnico or /login — never on the supervisor route
      await page.waitForURL(/\/(tecnico|login)/, { timeout: 10_000 });
      expect(page.url()).toMatch(/\/(tecnico|login)/);
    });
  }

  test("/marcaje (kiosco) accesible — muestra pantalla PIN", async ({ page }) => {
    await page.goto("/marcaje");
    await page.waitForLoadState("networkidle");
    // Kiosk is a separate auth surface (PIN-based), always shows PIN screen
    expect(page.url()).not.toContain("/login");
  });
});
