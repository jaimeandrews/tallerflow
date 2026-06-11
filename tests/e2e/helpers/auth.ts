/**
 * Authentication helpers for TallerFlow E2E tests.
 *
 * All helpers navigate to the login page, fill credentials, submit, and
 * wait for the expected post-login state. They are intentionally UI-driven
 * (not API shortcuts) so they also validate the auth flow itself.
 *
 * Seed credentials (from prisma/seed.ts — update both if seed changes):
 *   ADMIN:       admin@tallerflow.cl         / admin123
 *   JEFE_TALLER: jefe.antofagasta@tallerflow.cl / jefe123
 *   TECNICO PIN: 1234 (Antofagasta — first sucursal alphabetically)
 */

import { type Page, expect } from "@playwright/test";

// ── Web login helpers ─────────────────────────────────────────────────────────

async function loginWeb(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: /ingresar/i }).click();

  // Wait for dashboard redirect — indicates successful auth
  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 10_000 });
}

/**
 * Log in as ADMIN (admin@tallerflow.cl).
 * Validates that the sidebar shows all sections including "Configuración".
 */
export async function loginComoAdmin(page: Page): Promise<void> {
  await loginWeb(page, "admin@tallerflow.cl", "admin123");
  // Admin sees Configuración in the sidebar
  await expect(page.getByRole("link", { name: /configuración/i })).toBeVisible();
}

/**
 * Log in as JEFE_TALLER (jefe.antofagasta@tallerflow.cl).
 * Has access to Dashboard, Órdenes, Asignación, Configuración (limited).
 */
export async function loginComoJefe(page: Page): Promise<void> {
  await loginWeb(page, "jefe.antofagasta@tallerflow.cl", "jefe123");
}

/**
 * Log in as the first seed TECNICO via the web interface.
 * TECNICOs are redirected to /tecnico after login.
 */
export async function loginComoTecnico(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email").fill("tecnico1.ant@tallerflow.cl");
  await page.getByLabel("Contraseña").fill("tecnico123");
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL("**/tecnico**", { timeout: 20_000 });
}

// ── Kiosco PIN login ──────────────────────────────────────────────────────────

/**
 * Navigate to the kiosco (/marcaje) and enter a PIN digit by digit via the
 * on-screen keypad. The component auto-submits after the 4th digit.
 *
 * @param pin  4-digit string, e.g. "1234"
 */
export async function loginConPIN(page: Page, pin: string): Promise<void> {
  await page.goto("/marcaje");
  await page.waitForLoadState("networkidle");

  // The PIN screen must be visible (not already logged in to kiosco)
  await expect(
    page.getByText(/ingresa tu PIN/i),
    "PIN screen should be visible before entering PIN"
  ).toBeVisible({ timeout: 10_000 });

  // Click each digit on the keypad
  for (const digit of pin.split("")) {
    // Buttons are identified by their visible text content (digit characters)
    await page.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
  }

  // After the 4th digit the component auto-submits and transitions to the
  // dashboard / timer screen (shows the technician's name or timer)
  await expect(
    page.locator("[class*='timer'], h1, h2").filter({ hasText: /turno|marcaje|hola|trabajando/i }),
    "Dashboard or timer should appear after successful PIN"
  ).toBeVisible({ timeout: 15_000 });
}

// ── Logout ────────────────────────────────────────────────────────────────────

/**
 * Logout from the supervisor dashboard (sidebar button).
 */
export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: /cerrar sesión/i }).click();
  await page.waitForURL("**/login", { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();
}

/**
 * Logout from the kiosco screen (top-right button).
 */
export async function logoutKiosco(page: Page): Promise<void> {
  await page.getByRole("button", { name: /cerrar sesión/i }).click();
  // Returns to the PIN entry screen
  await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({ timeout: 10_000 });
}
