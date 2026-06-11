/**
 * E2E tests — Authentication flows
 *
 * Covers: web login, PIN kiosco login, logout, session guard, rate limiting.
 * Uses chromium-unauth project (no pre-saved auth state) so every test
 * exercises the full authentication flow from scratch.
 */

import { test, expect, type Browser, type BrowserContext } from "@playwright/test";
import { loginComoAdmin, loginConPIN, logout } from "./helpers/auth";
import { esperarToast } from "./helpers/waiters";
import { SEED_DATA } from "./helpers/seed";

// All auth tests must run without a pre-loaded session so that session-guard
// and login-flow tests behave correctly. This overrides the project-level
// storageState (admin.json) set in playwright.config.ts.
test.use({ storageState: { cookies: [], origins: [] } });

// ── Web login ─────────────────────────────────────────────────────────────────

test.describe("Login web (email + contraseña)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
  });

  test("credenciales correctas → redirect a /dashboard", async ({ page }) => {
    await page.getByLabel("Email").fill(SEED_DATA.usuarios.admin.email);
    await page.getByLabel("Contraseña").fill(SEED_DATA.usuarios.admin.password);
    await page.getByRole("button", { name: /ingresar/i }).click();

    await page.waitForURL("**/dashboard", { timeout: 20_000 });
    await expect(page.getByText("Dashboard")).toBeVisible();
  });

  test("password incorrecta → mensaje de error genérico", async ({ page }) => {
    await page.getByLabel("Email").fill(SEED_DATA.usuarios.admin.email);
    await page.getByLabel("Contraseña").fill("password_incorrecta_xyz");
    await page.getByRole("button", { name: /ingresar/i }).click();

    // Error message must NOT reveal whether the email exists
    await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible({ timeout: 8_000 });
    // Must NOT say "usuario no existe" or "contraseña"
    await expect(page.getByText(/usuario no existe/i)).not.toBeVisible();
    await expect(page.getByText(/contraseña incorrecta/i)).not.toBeVisible();
    // Must stay on /login
    expect(page.url()).toContain("/login");
  });

  test("email que no existe → mismo mensaje genérico (anti-enumeración)", async ({ page }) => {
    await page.getByLabel("Email").fill("noexiste_xyzabc@tallerflow.cl");
    await page.getByLabel("Contraseña").fill("cualquier_password");
    await page.getByRole("button", { name: /ingresar/i }).click();

    await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible({ timeout: 8_000 });
    expect(page.url()).toContain("/login");
  });

  test("usuario desactivado → error genérico (mismo que password incorrecta)", async ({
    page,
    browser,
  }: {
    page: import("@playwright/test").Page;
    browser: Browser;
  }) => {
    // Disable tecnico2 via admin API using a separate browser context
    const adminCtx: BrowserContext = await browser.newContext({
      storageState: "tests/e2e/fixtures/.auth/admin.json",
    });
    const api = adminCtx.request;

    // Find tecnico2 by email
    const listResp = await api.get(
      `/api/configuracion/usuarios?busqueda=${encodeURIComponent("tecnico2.ant@tallerflow.cl")}`
    );
    const { data } = (await listResp.json()) as { data: { id: string; activo: boolean }[] };
    const tecnico = data[0];
    expect(tecnico, "tecnico2 debe existir en el seed").toBeTruthy();

    // If currently active, disable
    if (tecnico.activo) {
      await api.patch(`/api/configuracion/usuarios/${tecnico.id}/toggle-activo`);
    }

    // Attempt login as the disabled user
    await page.getByLabel("Email").fill("tecnico2.ant@tallerflow.cl");
    await page.getByLabel("Contraseña").fill("tecnico123");
    await page.getByRole("button", { name: /ingresar/i }).click();

    await expect(page.getByText(/credenciales incorrectas/i)).toBeVisible({ timeout: 8_000 });
    expect(page.url()).toContain("/login");

    // Cleanup: re-enable the user
    await api.patch(`/api/configuracion/usuarios/${tecnico.id}/toggle-activo`);
    await adminCtx.close();
  });
});

// ── Session guard ─────────────────────────────────────────────────────────────

test.describe("Protección de rutas (session guard)", () => {
  test("acceder a /dashboard sin sesión → redirect a /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("acceder a /configuracion sin sesión → redirect a /login", async ({ page }) => {
    await page.goto("/configuracion");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("callbackUrl preservado para regresar tras login", async ({ page }) => {
    await page.goto("/reportes");
    // Should redirect to /login with callbackUrl
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("callbackUrl");

    // After login, should land on /reportes (or dashboard if restricted)
    await page.getByLabel("Email").fill(SEED_DATA.usuarios.admin.email);
    await page.getByLabel("Contraseña").fill(SEED_DATA.usuarios.admin.password);
    await page.getByRole("button", { name: /ingresar/i }).click();

    await page.waitForURL("**/reportes**", { timeout: 20_000 });
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

test.describe("Logout", () => {
  test.beforeEach(async ({ page }) => {
    await loginComoAdmin(page);
  });

  test("logout → redirect a /login", async ({ page }) => {
    await logout(page);
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();
  });

  test("después de logout, /dashboard redirige a /login", async ({ page }) => {
    await logout(page);
    await page.goto("/dashboard");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});

// ── PIN kiosco ────────────────────────────────────────────────────────────────

test.describe("Login PIN (kiosco)", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to kiosco and ensure we are on the PIN screen
    await page.goto("/marcaje");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({ timeout: 10_000 });
  });

  test("PIN correcto (1234) → pantalla de marcaje con timer", async ({ page }) => {
    // Tecnico1 PIN: 1234
    for (const digit of "1234".split("")) {
      await page.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
    }

    // PIN screen must disappear (auth succeeded)
    await expect(page.getByText(/ingresa tu PIN/i)).not.toBeVisible({ timeout: 15_000 });

    // Timer display must appear — TimerDisplay uses <div class="font-mono font-bold ...">
    // Filtering by div avoids matching the kiosco header Clock (<span>).
    await expect(
      page.locator("div.font-mono.font-bold").first(),
      "Timer should be visible after PIN login"
    ).toBeVisible({ timeout: 15_000 });

    // Quick-access activities should also be present in the right column
    await expect(
      page.locator("text=/Reparación|Diagnóstico|Garantía|Almuerzo/i").first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("PIN incorrecto → mensaje de error, dots en rojo", async ({ page }) => {
    // Enter wrong PIN
    for (const digit of "9999".split("")) {
      await page.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
    }

    // Error text appears
    await expect(page.getByText(/PIN inválido/i)).toBeVisible({ timeout: 8_000 });
    // Dots turn red (error state class)
    await expect(page.locator(".border-red-500, .bg-red-500").first()).toBeVisible({
      timeout: 5_000,
    });
    // PIN screen resets automatically after ~1.5s
    await expect(page.getByText(/PIN inválido/i)).not.toBeVisible({ timeout: 5_000 });
    // Still on PIN screen
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible();
  });

  test("6 PINs incorrectos consecutivos → mensaje de bloqueo / rate limit", async ({ page }) => {
    // Note: This test manipulates the server-side in-process rate limiter.
    // In CI, each test run starts fresh. Locally, the dev server may need
    // a restart between runs if this test leaves a 15-min block in effect.
    test.slow(); // Rate limit check involves multiple bcrypt operations

    const wrongPin = "9998"; // Use a pin unlikely to match any seed user

    let rateLimitHit = false;

    for (let i = 0; i < 6; i++) {
      for (const digit of wrongPin.split("")) {
        const btn = page.getByRole("button", { name: new RegExp(`^${digit}$`) });
        // Button may be re-rendered after the error animation — retry click
        await btn.click({ timeout: 3_000 }).catch(() => {});
      }

      // Check for rate limit response (429) or regular PIN invalid
      const hasRateLimit = await page
        .getByText(/bloqueado|demasiados intentos|rate.?limit/i)
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      if (hasRateLimit) {
        rateLimitHit = true;
        break;
      }

      // Wait for the PIN input to reset before next attempt
      await page.waitForTimeout(1_800);
    }

    // By 6 attempts, the server should have applied a block
    expect(rateLimitHit, "Rate limit should activate after multiple failed PINs").toBe(true);
  });

  test("PIN session expira por inactividad (simulado con page.clock)", async ({ page }) => {
    // Install fake clock BEFORE navigating so all timers are mocked from the start
    await page.clock.install({ time: Date.now() });

    await page.goto("/marcaje");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({ timeout: 10_000 });

    // Log in
    for (const digit of "1234".split("")) {
      await page.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
    }

    // Wait for dashboard to appear
    await expect(page.locator("text=/Reparación|Diagnóstico|Garantía/i").first()).toBeVisible({
      timeout: 15_000,
    });

    // Fast-forward 5 minutes + 10 seconds (the inactivity timeout)
    await page.clock.fastForward(5 * 60 * 1000 + 10_000);

    // The inactivity hook fires → clearAuth() → back to PIN screen
    await expect(
      page.getByText(/ingresa tu PIN/i),
      "PIN screen should reappear after inactivity timeout"
    ).toBeVisible({ timeout: 5_000 });
  });
});
