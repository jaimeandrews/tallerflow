/**
 * Playwright auth setup — runs ONCE before all test suites that need auth.
 *
 * Logs in as ADMIN and saves the browser storage state (cookies, localStorage)
 * to a JSON file. Subsequent test projects reuse this state so each test
 * doesn't need to log in individually.
 *
 * Seed credentials (from prisma/seed.ts):
 *   ADMIN: admin@tallerflow.cl / admin123
 *   JEFE_TALLER: jefe.antofagasta@tallerflow.cl / jefe123
 */

import { test as setup, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const AUTH_DIR = path.join(__dirname, "fixtures", ".auth");

// ── Admin session ─────────────────────────────────────────────────────────────

setup("authenticate as ADMIN", async ({ page }) => {
  const authFile = path.join(AUTH_DIR, "admin.json");

  await page.goto("/login");
  await expect(page).toHaveTitle(/TallerFlow/i);

  await page.getByLabel("Email").fill("admin@tallerflow.cl");
  await page.getByLabel("Contraseña").fill("admin123");
  await page.getByRole("button", { name: /ingresar/i }).click();

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 15_000 });
  await expect(page.getByText("Dashboard")).toBeVisible();

  // Save auth state
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: authFile });
});

// ── Jefe taller session (optional — uncomment if needed) ──────────────────────

setup("authenticate as JEFE_TALLER", async ({ page }) => {
  const authFile = path.join(AUTH_DIR, "jefe.json");

  await page.goto("/login");
  await page.getByLabel("Email").fill("jefe.antofagasta@tallerflow.cl");
  await page.getByLabel("Contraseña").fill("jefe123");
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL("**/dashboard", { timeout: 15_000 });

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: authFile });
});
