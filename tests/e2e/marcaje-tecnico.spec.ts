/**
 * E2E tests — Vista técnico (tablet, /tecnico)
 *
 * Differences from kiosco (/marcaje):
 *   - Login: email + password (NextAuth session cookie, not Bearer PIN)
 *   - Layout: max-w-lg centered, light bg-slate-50, NO sidebar
 *   - Buttons: <button> tags (not BotonAccion), same labels: Pausar/Reanudar/Finalizar
 *   - Activity change: "Cambiar actividad" (full phrase, not "Cambiar")
 *   - Quick activities: collapsible "Actividades rápidas" section
 *   - History: "Marcajes hoy" in a white card
 *
 * Seed data (prisma/seed.ts):
 *   tecnico1.ant@tallerflow.cl / tecnico123   (PIN: 1234)
 *   Activities: Reparación, Diagnóstico, Garantía (productivas)
 *              Almuerzo, Reunión, Espera repuesto, Aseo taller (no productivas)
 */

import { test, expect, type Page } from "@playwright/test";
import { SEED_DATA } from "./helpers/seed";

// ── Shared selectors ──────────────────────────────────────────────────────────

const SEL = {
  // EstadoPill — same component as kiosco
  estadoTrabajando: "Trabajando",
  estadoPausa: "En pausa",
  estadoDisponible: "Disponible",

  // Buttons — <button> text content (no BotonAccion wrapper here)
  btnPausar: /^Pausar$/,
  btnReanudar: /^Reanudar$/,
  btnFinalizar: /^Finalizar$/,
  btnCambiarActividad: /cambiar actividad/i,
  btnActividadesRapidas: /actividades rápidas/i,

  // Timer
  timerPattern: /\d{2}:\d{2}:\d{2}/,

  // Layout
  headerLogo: "TallerFlow",
  sinActividad: /sin actividad activa/i,

  // Sheets
  sheetCambiar: "Seleccionar actividad",
  sinOF: /sin OF específica/i,

  // History
  historialHeading: "Marcajes hoy",
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginTecnico(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Email").fill(SEED_DATA.usuarios.tecnico1.email);
  await page.getByLabel("Contraseña").fill(SEED_DATA.usuarios.tecnico1.password);
  await page.getByRole("button", { name: /ingresar/i }).click();

  await page.waitForURL("**/tecnico**", { timeout: 20_000 });
  await expect(page.getByText(SEL.headerLogo)).toBeVisible({ timeout: 8_000 });
}

async function waitForDashboard(page: Page) {
  await expect(
    page.getByRole("button", { name: SEL.btnCambiarActividad }),
    '"Cambiar actividad" button should be visible'
  ).toBeVisible({ timeout: 10_000 });
}

async function waitForTimer(page: Page) {
  // TimerDisplay inner div: <div class="font-mono font-bold ..."> with inline color style.
  // Using this specific locator avoids matching outer wrapper divs that inherit color.
  await expect(page.locator("div.font-mono.font-bold").first()).toBeVisible({ timeout: 10_000 });
}

async function seleccionarActividad(page: Page, nombre: string) {
  // Try quick access section first (collapsed by default — expand it)
  const actRapidasBtn = page.getByRole("button", { name: SEL.btnActividadesRapidas });
  const isOpen = await page
    .locator("button", { hasText: /actividades rápidas/i })
    .evaluate((el) => el.getAttribute("aria-expanded") === "true")
    .catch(() => false);

  if (!isOpen) {
    await actRapidasBtn.click();
  }

  // Check if target activity is visible in the expanded section
  const actInGrid = page
    .locator("[class*='ActividadGrid'], div")
    .getByRole("button", { name: new RegExp(`^${nombre}$`, "i") });

  const gridVisible = await actInGrid.isVisible({ timeout: 2_000 }).catch(() => false);

  if (gridVisible) {
    await actInGrid.click();
  } else {
    // Use the "Cambiar actividad" sheet
    await page.getByRole("button", { name: SEL.btnCambiarActividad }).click();
    await expect(page.getByText(SEL.sheetCambiar)).toBeVisible({ timeout: 5_000 });
    await page
      .getByRole("button", { name: new RegExp(nombre, "i") })
      .last()
      .click();
  }

  // Handle OF selection if it appears
  if (
    await page
      .getByText(/¿en qué OF\?/i)
      .isVisible({ timeout: 2_000 })
      .catch(() => false)
  ) {
    await page.getByRole("button", { name: SEL.sinOF }).click();
  }
}

async function finalizarMarcaje(page: Page) {
  const btn = page.getByRole("button", { name: SEL.btnFinalizar });
  await btn.waitFor({ state: "visible", timeout: 8_000 });
  await btn.click();
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe("Vista técnico — login web y layout", () => {
  test("login como técnico → redirect a /tecnico sin sidebar", async ({ page }) => {
    await loginTecnico(page);

    // URL must be /tecnico
    expect(page.url()).toContain("/tecnico");

    // Header must show TallerFlow logo and technician name
    await expect(page.getByText(SEL.headerLogo)).toBeVisible();

    // No supervisor sidebar — the aside nav that appears in dashboard layout
    // The (tecnico) layout has no aside element and no data-tallerflow-shell attribute
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(page.locator("[data-tallerflow-shell]")).toHaveCount(0);

    // No links to supervisor sections (Órdenes, Centro de control, etc.)
    await expect(page.getByRole("link", { name: /órdenes de trabajo/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /centro de control/i })).toHaveCount(0);
  });

  test("layout portrait — contenido centrado, sin scroll horizontal", async ({ page }) => {
    // Simulate tablet in portrait mode
    await page.setViewportSize({ width: 430, height: 932 }); // iPhone 14 Pro Max
    await loginTecnico(page);

    // No horizontal overflow — scrollWidth should not exceed clientWidth
    const hasHorzScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorzScroll, "Page should not overflow horizontally in portrait").toBe(false);

    // Timer card should be visible without scrolling
    await expect(page.getByText(SEL.estadoDisponible)).toBeVisible();

    // Content is within max-w-lg (512px) — the timer div should be <= 512px wide
    // React serializes style={{ borderTopColor }} as CSS border-top-color in the DOM.
    const timerCard = page.locator("[style*='border-top-color']").first();
    const box = await timerCard.boundingBox().catch(() => null);
    if (box) {
      expect(box.width, "Timer card should be ≤ 512px (max-w-lg)").toBeLessThanOrEqual(512 + 32); // +32px for px-4 gutters
    }
  });

  test("/tecnico sin sesión → redirect a /login", async ({ page }) => {
    await page.goto("/tecnico");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Flujos de marcaje — vista técnico", () => {
  test.beforeEach(async ({ page }) => {
    await loginTecnico(page);
    await waitForDashboard(page);
  });

  test.afterEach(async ({ page }) => {
    try {
      const finBtn = page.getByRole("button", { name: SEL.btnFinalizar });
      if (await finBtn.isEnabled({ timeout: 1_500 }).catch(() => false)) {
        await finBtn.click();
        await page.waitForTimeout(800);
      }
    } catch {
      // ignore cleanup errors
    }
  });

  // ── 1. Iniciar actividad ────────────────────────────────────────────────────

  test("Reparación → timer verde, EstadoPill = Trabajando", async ({ page }) => {
    // Initially shows "Sin actividad activa"
    await expect(page.getByText(SEL.sinActividad)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(SEL.estadoDisponible)).toBeVisible();

    await seleccionarActividad(page, "Reparación");

    // Label above timer: "Reparación · trabajando"
    await expect(page.getByText(/Reparación\s*·\s*trabajando/i)).toBeVisible({ timeout: 10_000 });

    // EstadoPill changes to Trabajando
    await expect(page.getByText(SEL.estadoTrabajando)).toBeVisible({ timeout: 5_000 });

    // Timer color is green (#2C8A4A = rgb(44, 138, 74))
    const timerEl = page.locator("div.font-mono.font-bold").first();
    const color = await timerEl.evaluate((el) => window.getComputedStyle(el).color);
    expect(color, "Timer should be green (TRABAJANDO)").toBe("rgb(44, 138, 74)");

    // "Sin actividad activa" text gone
    await expect(page.getByText(SEL.sinActividad)).not.toBeVisible();
  });

  // ── 2. Timer avanza ─────────────────────────────────────────────────────────

  test("timer avanza — distinto a 00:00:00 tras 2 segundos", async ({ page }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);

    await page.waitForTimeout(2_500);

    const timerText = await page.locator("div.font-mono.font-bold").first().textContent();
    expect(timerText, "Timer should be running (not 00:00:00)").not.toBe("00:00:00");
  });

  // ── 3. Pausar ───────────────────────────────────────────────────────────────

  test("Pausar → timer amarillo, EstadoPill = En pausa, botón Reanudar", async ({ page }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);

    // Click Pausar (amber button with Pause icon)
    await page.getByRole("button", { name: SEL.btnPausar }).click();

    // State changes to PAUSA
    await expect(page.getByText(SEL.estadoPausa)).toBeVisible({ timeout: 8_000 });

    // Timer color changes to yellow (#F4A91A = rgb(244, 169, 26))
    const color = await page
      .locator("div.font-mono.font-bold")
      .first()
      .evaluate((el) => window.getComputedStyle(el).color);
    expect(color, "Timer should be yellow when paused").toBe("rgb(244, 169, 26)");

    // "Pausar" replaced by "Reanudar" (green button)
    await expect(page.getByRole("button", { name: SEL.btnReanudar })).toBeVisible();
    await expect(page.getByRole("button", { name: SEL.btnPausar })).not.toBeVisible();

    // Finalizar stays visible (can finalize while paused)
    await expect(page.getByRole("button", { name: SEL.btnFinalizar })).toBeVisible();
  });

  // ── 4. Reanudar ─────────────────────────────────────────────────────────────

  test("Reanudar → timer verde, EstadoPill = Trabajando, botón Pausar vuelve", async ({ page }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);

    await page.getByRole("button", { name: SEL.btnPausar }).click();
    await expect(page.getByText(SEL.estadoPausa)).toBeVisible({ timeout: 8_000 });

    await page.getByRole("button", { name: SEL.btnReanudar }).click();

    // Back to TRABAJANDO
    await expect(page.getByText(SEL.estadoTrabajando)).toBeVisible({ timeout: 8_000 });

    // Timer green again
    const color = await page
      .locator("div.font-mono.font-bold")
      .first()
      .evaluate((el) => window.getComputedStyle(el).color);
    expect(color, "Timer should be green after resuming").toBe("rgb(44, 138, 74)");

    // "Reanudar" replaced by "Pausar"
    await expect(page.getByRole("button", { name: SEL.btnPausar })).toBeVisible();
    await expect(page.getByRole("button", { name: SEL.btnReanudar })).not.toBeVisible();
  });

  // ── 5. Cambiar actividad ────────────────────────────────────────────────────

  test("Cambiar actividad a Diagnóstico → label actualizado", async ({ page }) => {
    // Start with Reparación
    await seleccionarActividad(page, "Reparación");
    await expect(page.getByText(/Reparación\s*·\s*trabajando/i)).toBeVisible({
      timeout: 10_000,
    });

    // Use "Cambiar actividad" button → sheet → Diagnóstico
    await page.getByRole("button", { name: SEL.btnCambiarActividad }).click();
    await expect(page.getByText(SEL.sheetCambiar)).toBeVisible({ timeout: 5_000 });
    await page
      .getByRole("button", { name: /diagnóstico/i })
      .last()
      .click();

    // Handle OF sheet if it appears
    if (
      await page
        .getByText(/¿en qué OF\?/i)
        .isVisible({ timeout: 2_000 })
        .catch(() => false)
    ) {
      await page.getByRole("button", { name: SEL.sinOF }).click();
    }

    // Label updates to Diagnóstico
    await expect(page.getByText(/Diagnóstico\s*·\s*trabajando/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Reparación\s*·/i)).not.toBeVisible();
  });

  // ── 6. Finalizar ────────────────────────────────────────────────────────────

  test("Finalizar → timer se detiene, estado vuelve a Disponible", async ({ page }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);

    await finalizarMarcaje(page);

    // Estado returns to Disponible
    await expect(page.getByText(SEL.estadoDisponible)).toBeVisible({ timeout: 10_000 });

    // "Sin actividad activa" text reappears
    await expect(page.getByText(SEL.sinActividad)).toBeVisible({ timeout: 8_000 });

    // Finalizar and Pausar buttons are disabled
    await expect(page.getByRole("button", { name: SEL.btnFinalizar })).toBeDisabled({
      timeout: 5_000,
    });
    await expect(page.getByRole("button", { name: SEL.btnPausar })).toBeDisabled({
      timeout: 5_000,
    });
  });

  // ── 7. Historial del día ────────────────────────────────────────────────────

  test("historial del día muestra registros después de un marcaje", async ({ page }) => {
    // Complete a cycle to generate a history entry
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);
    await finalizarMarcaje(page);

    // "Marcajes hoy" section is always visible
    await expect(page.getByText(SEL.historialHeading)).toBeVisible({ timeout: 8_000 });

    // Should contain at least "Reparación" entry in the timeline
    await expect(page.locator("text=/Reparación/i").last()).toBeVisible({ timeout: 8_000 });
  });

  // ── 8. Almuerzo sin OF ──────────────────────────────────────────────────────

  test("Almuerzo (no productiva) inicia sin pedir OF", async ({ page }) => {
    await page.getByRole("button", { name: SEL.btnCambiarActividad }).click();
    await expect(page.getByText(SEL.sheetCambiar)).toBeVisible({ timeout: 5_000 });

    await page
      .getByRole("button", { name: /almuerzo/i })
      .last()
      .click();

    // OF sheet should NOT appear
    await expect(page.getByText(/¿en qué OF\?/i)).not.toBeVisible({ timeout: 2_000 });

    // Activity starts directly — "Almuerzo" visible in page
    await expect(page.getByText(/almuerzo/i).first()).toBeVisible({ timeout: 10_000 });

    // Finalizar should be enabled
    await expect(page.getByRole("button", { name: SEL.btnFinalizar })).toBeEnabled({
      timeout: 8_000,
    });
  });

  // ── 9. Actividades rápidas (collapsible) ────────────────────────────────────

  test("sección Actividades rápidas — expandir muestra grid, colapsar lo oculta", async ({
    page,
  }) => {
    // "Actividades rápidas" section starts collapsed
    const actGrid = page
      .locator("div")
      .filter({ hasText: /^Reparación$|^Diagnóstico$/ })
      .first();

    // Initially the grid is hidden (collapsed)
    // The expand button should be visible
    const expandBtn = page.getByRole("button", { name: SEL.btnActividadesRapidas });
    await expect(expandBtn).toBeVisible({ timeout: 8_000 });

    // Expand
    await expandBtn.click();

    // After expanding, activity buttons should be visible
    await expect(page.getByRole("button", { name: /reparación/i }).first()).toBeVisible({
      timeout: 5_000,
    });

    // Collapse again
    await expandBtn.click();

    // Activity buttons should be hidden (the grid is conditionally rendered)
    await expect(page.getByRole("button", { name: /reparación/i }).first()).not.toBeVisible({
      timeout: 3_000,
    });
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

test.describe("Vista técnico — logout", () => {
  test("logout → redirect a /login, /tecnico vuelve a pedir auth", async ({ page }) => {
    await loginTecnico(page);
    await waitForDashboard(page);

    // Logout via the header button (LogOut icon, no text label)
    await page.locator("header button").last().click();

    await page.waitForURL("**/login**", { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /ingresar/i })).toBeVisible();

    // Trying /tecnico without session should redirect back to /login
    await page.goto("/tecnico");
    await page.waitForURL("**/login**", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});
