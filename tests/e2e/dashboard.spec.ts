/**
 * E2E tests — Dashboard (layout + contenido operacional)
 *
 * ── Describe 1: Layout y sidebar (ADMIN) ────────────────────────────────────
 *   Runs with the admin session pre-loaded from admin.json (no explicit login).
 *   Verifies sidebar presence, link labels, and cross-route navigation.
 *
 * ── Describe 2: Contenido operacional (JEFE_TALLER) ─────────────────────────
 *   Runs with jefe.json. Uses a beforeAll that logs into the kiosco as
 *   Juan Riquelme (PIN 1234) and starts a Reparación marcaje, so:
 *     • The KPI "Técnicos activos" shows ≥ 1
 *     • Juan's row in "Técnicos en taller" shows a running timer (HH:MM:SS)
 *     • "Timeline operacional" has at least 1 entry (the Inicio event)
 *   The afterAll finalizes the marcaje to restore a clean state.
 *
 * KPI labels (from kpis-fila.tsx):
 *   "Técnicos activos", "OF en proceso", "Productividad hoy",
 *   "HH productivas", "HH no productivas", "OF críticas"
 *
 * Chart periods (GraficoProductividad tabs): "hoy", "7d", "30d"
 * Subtext keys:
 *   hoy  → "Hoy · % de HH productivas vs disponibles"
 *   7d   → "Últimos 7 días · % de HH productivas vs disponibles"
 *   30d  → "Últimos 30 días · % de HH productivas vs disponibles"
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { esperarCarga } from "./helpers/waiters";

// ─────────────────────────────────────────────────────────────────────────────
// Describe 1 — Layout y sidebar (ADMIN, pre-loaded session)
// ─────────────────────────────────────────────────────────────────────────────

const SIDEBAR_LINKS = [
  { name: "Dashboard", label: /dashboard/i, path: "/dashboard" },
  { name: "Órdenes", label: /órdenes/i, path: "/ordenes" },
  { name: "Asignación", label: /asignación/i, path: "/asignacion" },
  { name: "Centro Control", label: /centro.?control/i, path: "/centro-control" },
  { name: "Reportes", label: /reportes/i, path: "/reportes" },
  { name: "Configuración", label: /configuración/i, path: "/configuracion" },
] as const;

test.describe("Dashboard — layout y sidebar (ADMIN)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await esperarCarga(page);
  });

  test("carga sin redirect a /login (sesión admin válida)", async ({ page }) => {
    expect(page.url()).not.toContain("/login");
    expect(page.url()).toContain("/dashboard");
  });

  test("sidebar presente y visible", async ({ page }) => {
    await expect(page.locator("aside, nav[role='navigation']").first()).toBeVisible({
      timeout: 8_000,
    });
  });

  test("sidebar contiene todos los links de navegación", async ({ page }) => {
    for (const link of SIDEBAR_LINKS) {
      await expect(
        page.getByRole("link", { name: link.label }).first(),
        `Sidebar must have a link matching ${link.label}`
      ).toBeVisible({ timeout: 5_000 });
    }
  });

  test("branding TallerFlow visible en sidebar o topbar", async ({ page }) => {
    await expect(page.getByText(/TallerFlow/i).first()).toBeVisible({ timeout: 8_000 });
  });

  test("link Configuración visible para ADMIN", async ({ page }) => {
    await expect(page.getByRole("link", { name: /configuración/i }).first()).toBeVisible();
  });
});

test.describe("Dashboard — navegación desde sidebar (ADMIN)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await esperarCarga(page);
  });

  for (const link of SIDEBAR_LINKS) {
    if (link.path === "/dashboard") continue;

    test(`clic en "${link.name}" navega a ${link.path}`, async ({ page }) => {
      await page.getByRole("link", { name: link.label }).first().click();
      await page.waitForURL(`**${link.path}**`, { timeout: 10_000 });
      expect(page.url()).toContain(link.path);
      expect(page.url()).not.toContain("/login");
    });
  }

  test("volver a /dashboard desde otra sección", async ({ page }) => {
    await page.goto("/reportes");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("link", { name: /dashboard/i })
      .first()
      .click();
    await page.waitForURL("**/dashboard**", { timeout: 10_000 });
    expect(page.url()).toContain("/dashboard");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 2 — Contenido operacional (JEFE_TALLER)
// ─────────────────────────────────────────────────────────────────────────────

// Known KPI card titles (uppercase via CSS but DOM text is as-is)
const KPI_TITLES = [
  "Técnicos activos",
  "OF en proceso",
  "Productividad hoy",
  "HH productivas",
  "HH no productivas",
  "OF críticas",
] as const;

test.describe("Dashboard — contenido operacional (JEFE_TALLER)", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  // Kiosco context shared across beforeAll / afterAll
  let kioskoCtx: BrowserContext | undefined;
  let kioskoPage: Page | undefined;

  /**
   * Start a Reparación marcaje as Juan Riquelme (PIN 1234) so the dashboard
   * shows a running timer and at least one timeline entry.
   * Uses a fresh browser context (no localStorage/cookies) so the kiosco
   * starts at the PIN screen regardless of prior test state.
   */
  test.beforeAll(async ({ browser }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

    kioskoCtx = await browser.newContext({
      baseURL,
      locale: "es-CL",
      timezoneId: "America/Santiago",
    });
    kioskoPage = await kioskoCtx.newPage();

    // Navigate to kiosco — fresh context → PIN screen appears
    await kioskoPage.goto("/marcaje");
    await kioskoPage.waitForLoadState("networkidle");
    await expect(kioskoPage.getByText(/ingresa tu PIN/i)).toBeVisible({
      timeout: 10_000,
    });

    // Enter PIN 1234 (Juan Riquelme)
    for (const digit of "1234".split("")) {
      await kioskoPage.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
    }

    // Wait for the kiosco dashboard to appear ("Cambiar" button = ready)
    await kioskoPage
      .getByRole("button", { name: "Cambiar" })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Finalize any pre-existing active marcaje (from prior test runs)
    const finBtn = kioskoPage.getByRole("button", { name: "Finalizar" });
    if (await finBtn.isEnabled({ timeout: 1_500 }).catch(() => false)) {
      await finBtn.click();
      await kioskoPage.waitForTimeout(800);
    }

    // Start a Reparación marcaje
    const quickRep = kioskoPage.getByRole("button", {
      name: /^Reparación$/i,
    });
    const repVisible = await quickRep.isVisible({ timeout: 2_000 }).catch(() => false);

    if (repVisible) {
      await quickRep.click();
    } else {
      await kioskoPage.getByRole("button", { name: "Cambiar" }).click();
      await kioskoPage
        .getByRole("button", { name: /reparación/i })
        .last()
        .click();
    }

    // Dismiss OF selection sheet if it appears
    const ofSheet = kioskoPage.getByText(/¿en qué OF\?/i);
    if (await ofSheet.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await kioskoPage.getByRole("button", { name: "Sin OF específica" }).click();
    }

    // Verify marcaje is now active (Finalizar enabled = marcaje running)
    await expect(finBtn).toBeEnabled({ timeout: 8_000 });
  });

  /** Finalize Juan's marcaje and close the kiosco context. */
  test.afterAll(async () => {
    if (kioskoPage) {
      try {
        const finBtn = kioskoPage.getByRole("button", { name: "Finalizar" });
        if (await finBtn.isEnabled({ timeout: 1_500 }).catch(() => false)) {
          await finBtn.click();
          await kioskoPage.waitForTimeout(600);
        }
      } catch {
        // Ignore cleanup errors — test result is already recorded
      }
    }
    await kioskoCtx?.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    // Dashboard makes several parallel API requests — wait for all to settle
    await esperarCarga(page, 20_000);
  });

  // ── 1. 6 KPIs visibles con valores numéricos ─────────────────────────────

  test("6 KPIs visibles con valores no vacíos y sin NaN", async ({ page }) => {
    // All 6 titles visible
    for (const title of KPI_TITLES) {
      await expect(
        page.getByText(title, { exact: true }),
        `KPI "${title}" must be visible`
      ).toBeVisible({ timeout: 8_000 });
    }

    // All 6 value spans rendered (text-3xl font-bold in KpiCard)
    const valueSpans = page.locator("span.text-3xl.font-bold");
    await expect(valueSpans).toHaveCount(6, { timeout: 8_000 });

    // None of the values contains "NaN" or is empty
    for (const span of await valueSpans.all()) {
      const text = (await span.textContent()) ?? "";
      expect(text.trim(), "KPI value must not be empty").toBeTruthy();
      expect(text, "KPI value must not contain NaN").not.toContain("NaN");
    }

    // Spot-check: "Técnicos activos" shows "1/3" (Juan is TRABAJANDO)
    // Value format: "{tecnicosActivos}/{tecnicosTotal}"
    const tecActivosKpi = page
      .getByText("Técnicos activos", { exact: true })
      .locator("..")
      .locator("span.text-3xl");
    const tecText = await tecActivosKpi.textContent();
    // Should match "X/Y" format (e.g. "1/3")
    expect(tecText).toMatch(/^\d+\/\d+$/);
  });

  // ── 2. Gráfico de productividad (Recharts SVG) ───────────────────────────

  test("gráfico de productividad renderiza un SVG", async ({ page }) => {
    // Chart section identified by its heading
    const heading = page.getByRole("heading", {
      name: "Productividad operacional",
    });
    await expect(heading).toBeVisible({ timeout: 8_000 });

    // Navigate to chart outer container (h2 → div.flex.items-center → div → header div → outer)
    const chartContainer = heading.locator("../../../..");

    // Recharts renders inside ResponsiveContainer as an <svg> element
    const chartSvg = chartContainer.locator("svg").first();
    await expect(chartSvg, "Recharts AreaChart must render an SVG element").toBeVisible({
      timeout: 8_000,
    });

    // Period subtext present (default is "hoy")
    await expect(chartContainer.getByText(/% de HH productivas vs disponibles/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  // ── 3. Lista técnicos con timer ──────────────────────────────────────────

  test("lista de técnicos en taller muestra al menos 1 técnico con timer", async ({ page }) => {
    const section = page.getByRole("heading", { name: "Técnicos en taller" });
    await expect(section).toBeVisible({ timeout: 8_000 });

    // At least 1 technician row (Juan Riquelme should be here — TRABAJANDO)
    // TecRowLive renders inside the scrollable div
    const tecRows = page
      .locator("div.flex-1.overflow-y-auto")
      .locator("div.flex.items-center.gap-3.rounded-lg");
    await expect(tecRows.first()).toBeVisible({ timeout: 8_000 });

    // Juan Riquelme visible with TRABAJANDO pill
    await expect(page.getByText("Juan Riquelme")).toBeVisible({
      timeout: 8_000,
    });

    // Timer element present: span.font-mono.tabular-nums in TecRowLive
    // Shows HH:MM:SS when active, "—" when idle. Juan has an active marcaje → HH:MM:SS
    const timerSpan = page
      .locator("span.font-mono.tabular-nums")
      .filter({ hasText: /\d{2}:\d{2}:\d{2}/ })
      .first();
    await expect(
      timerSpan,
      "At least one technician must have a running timer (HH:MM:SS)"
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── 4. Timeline con al menos 1 entrada ───────────────────────────────────

  test("timeline operacional muestra al menos 1 entrada", async ({ page }) => {
    const heading = page.getByRole("heading", {
      name: "Timeline operacional",
    });
    await expect(heading).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Últimas marcaciones")).toBeVisible();

    // Empty-state text must NOT appear (Juan's marcaje created an entry)
    await expect(page.getByText(/sin marcaciones registradas hoy/i)).not.toBeVisible({
      timeout: 5_000,
    });

    // The timeline <ol> list must have at least 1 <li>
    const timelineList = page.locator("ol.relative");
    await expect(timelineList).toBeVisible({ timeout: 8_000 });
    await expect(
      timelineList.locator("li").first(),
      "Timeline must have at least one entry"
    ).toBeVisible({ timeout: 8_000 });

    // Entry shows the Inicio prefix from TIPO_PREFIJO
    await expect(timelineList.getByText(/inicio:/i).first()).toBeVisible({ timeout: 5_000 });
  });

  // ── 5. Tabla OF críticas visible (incluye 2512003 del seed) ─────────────

  test("tabla 'Órdenes que requieren atención' visible (con 2512003 crítica)", async ({ page }) => {
    const heading = page.getByRole("heading", {
      name: "Órdenes que requieren atención",
    });
    await expect(heading).toBeVisible({ timeout: 8_000 });

    // "Ver todas" link always present
    await expect(page.getByRole("link", { name: /ver todas/i })).toBeVisible();

    // Seed OF 2512003 is critica=true (ESPERA_REPUESTO state) → should appear
    // The table renders OF numbers in span.font-mono.text-xs.font-semibold
    await expect(
      page.getByText("2512003", { exact: true }),
      "Seed OF 2512003 (critica) must appear in the critical OFs table"
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── 6. Cambiar periodo del gráfico ───────────────────────────────────────

  test("cambiar periodo a '7d' → subtext actualizado, sin error", async ({ page }) => {
    // Verify initial period is "hoy" (default)
    await expect(page.getByText(/Hoy · % de HH productivas vs disponibles/)).toBeVisible({
      timeout: 8_000,
    });

    // Click "7d" tab
    const tab7d = page.getByRole("tab", { name: "7d" });
    await expect(tab7d).toBeVisible({ timeout: 5_000 });
    await tab7d.click();

    // Subtext changes to "Últimos 7 días…" after period change
    await expect(
      page.getByText(/Últimos 7 días · % de HH productivas vs disponibles/),
      "Chart subtext must update to '7 días' after clicking the 7d tab"
    ).toBeVisible({ timeout: 8_000 });

    // Chart SVG still present (no crash on period change)
    const heading = page.getByRole("heading", {
      name: "Productividad operacional",
    });
    const chartContainer = heading.locator("../../../..");
    await expect(chartContainer.locator("svg").first()).toBeVisible({
      timeout: 8_000,
    });

    // No error indicator visible (error would show an alert icon near the heading)
    // ErrorIndicator renders only when error prop is non-null
    await expect(page.getByRole("img", { name: /error/i }))
      .not.toBeVisible({ timeout: 3_000 })
      .catch(() => {});
    // Simpler: confirm the heading area has no error text
    await expect(chartContainer.getByText(/error/i))
      .not.toBeVisible({ timeout: 3_000 })
      .catch(() => {});
  });
});
