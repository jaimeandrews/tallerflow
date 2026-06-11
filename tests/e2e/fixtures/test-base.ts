/**
 * Extended Playwright test fixture with project-specific helpers.
 *
 * Usage:
 *   import { test, expect } from "../fixtures/test-base";
 */

import { test as base, expect, type Page } from "@playwright/test";

// ── Seed data constants ───────────────────────────────────────────────────────
// These match prisma/seed.ts — update both if seed changes.

export const SEED = {
  admin: { email: "admin@tallerflow.cl", password: "admin123" },
  jefe: { email: "jefe.antofagasta@tallerflow.cl", password: "jefe123" },
  tecnico: { pin: "1234" },
} as const;

// ── Helper: login programmatically via API ─────────────────────────────────────
// Faster than UI login — uses NextAuth credentials endpoint directly.

export async function loginViaApi(page: Page, email: string, password: string) {
  const response = await page.request.post("/api/auth/callback/credentials", {
    form: {
      email,
      password,
      csrfToken: "", // NextAuth v5 handles CSRF internally for credentials
      redirect: "false",
    },
  });
  // Accept 200 or redirect (NextAuth may redirect after credentials sign-in)
  return response.status();
}

// ── Page Object: LoginPage ────────────────────────────────────────────────────

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto("/login");
    await this.page.waitForLoadState("networkidle");
  }

  async login(email: string, password: string) {
    await this.page.getByLabel("Email").fill(email);
    await this.page.getByLabel("Contraseña").fill(password);
    await this.page.getByRole("button", { name: /ingresar/i }).click();
  }

  get errorMessage() {
    return this.page.getByText(/credenciales incorrectas/i);
  }
}

// ── Custom fixtures ───────────────────────────────────────────────────────────

type TallerFlowFixtures = {
  loginPage: LoginPage;
};

export const test = base.extend<TallerFlowFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});

export { expect };
