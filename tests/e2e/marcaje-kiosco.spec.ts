/**
 * E2E tests — Flujo completo de marcaje en kiosco
 *
 * UI reference (from page.tsx + EstadoPill + TimerDisplay):
 *   - Estado "TRABAJANDO" → label "Trabajando", color #2C8A4A (verde)
 *   - Estado "PAUSA"      → label "En pausa",   color #F4A91A (amarillo)
 *   - Estado "DISPONIBLE" → label "Disponible", color #6E7278 (gris)
 *
 *   Timer text: "{actividadNombre} · {estado.label.toLowerCase()}"
 *   Buttons: "Pausar" (when active), "Reanudar" (when paused),
 *            "Finalizar", "Cambiar"
 *
 * Seed data (prisma/seed.ts):
 *   Actividades productivas: Reparación, Diagnóstico, Garantía
 *   No productivas: Espera repuesto, Aseo taller, Reunión, Almuerzo
 *   Tecnico1 PIN: 1234
 */

import { test, expect, type Page } from "@playwright/test";

// ── Shared selectors ──────────────────────────────────────────────────────────

const SEL = {
  // EstadoPill labels (from ESTADO_CONFIG.label)
  estadoTrabajando: "Trabajando",
  estadoPausa: "En pausa",
  estadoDisponible: "Disponible",

  // Buttons (exact aria names from BotonAccion label prop)
  btnPausar: "Pausar",
  btnReanudar: "Reanudar",
  btnFinalizar: "Finalizar",
  btnCambiar: "Cambiar",

  // Sheet
  sheetTitle: "Seleccionar actividad",
  sinOFBtn: "Sin OF específica",

  // Historial
  historialHeading: "Marcajes hoy",

  // Timer: TimerDisplay shows HH:MM:SS in large monospace text
  timerPattern: /\d{2}:\d{2}:\d{2}/,
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function enterPin(page: Page, pin: string) {
  for (const digit of pin.split("")) {
    await page.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
  }
}

async function waitForDashboard(page: Page) {
  // Dashboard is ready when the "Cambiar" button and activity name text are visible
  await expect(page.getByRole("button", { name: SEL.btnCambiar })).toBeVisible({
    timeout: 15_000,
  });
}

async function waitForTimer(page: Page) {
  // TimerDisplay renders in <div class="font-mono font-bold ..."> with inline color.
  // The kiosco header also shows a Clock in <span class="... text-sm">.
  // Filtering by div.font-mono.font-bold avoids matching the header clock.
  await expect(
    page.locator("div.font-mono.font-bold").first(),
    "Timer should be visible and running"
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Select an activity from the quick-access row or sheet.
 * If the OF selection sheet appears (productive activity + has assignments),
 * automatically clicks "Sin OF específica".
 */
async function seleccionarActividad(page: Page, nombre: string) {
  // Try quick-access buttons first (visible without opening sheet)
  const quickBtn = page.getByRole("button", { name: new RegExp(`^${nombre}$`, "i") });
  const quickVisible = await quickBtn.isVisible({ timeout: 2_000 }).catch(() => false);

  if (quickVisible) {
    await quickBtn.click();
  } else {
    // Open the activity sheet
    await page.getByRole("button", { name: SEL.btnCambiar }).click();
    await expect(page.getByText(SEL.sheetTitle)).toBeVisible({ timeout: 5_000 });

    // Click the target activity inside the sheet
    await page
      .getByRole("button", { name: new RegExp(nombre, "i") })
      .last()
      .click();
  }

  // If the OF selection sheet appears, dismiss it with "Sin OF específica"
  const ofSheet = page.getByText(/¿en qué OF\?/i);
  if (await ofSheet.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await page.getByRole("button", { name: SEL.sinOFBtn }).click();
  }
}

async function finalizarMarcaje(page: Page) {
  const btn = page.getByRole("button", { name: SEL.btnFinalizar });
  await btn.waitFor({ state: "visible", timeout: 8_000 });
  await btn.click();
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

test.describe("Flujo de marcaje kiosco", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to kiosco and log in with PIN
    await page.goto("/marcaje");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({ timeout: 10_000 });
    await enterPin(page, "1234");
    await waitForDashboard(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: finalize any open marcaje so next test starts clean
    try {
      const btn = page.getByRole("button", { name: SEL.btnFinalizar });
      if (await btn.isEnabled({ timeout: 1_500 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(800);
      }
    } catch {
      // ignore
    }
  });

  // ── Test 1: Iniciar "Reparación" → timer verde ────────────────────────────

  test("Reparación → timer comienza en verde, EstadoPill = Trabajando", async ({ page }) => {
    await seleccionarActividad(page, "Reparación");

    // Label above timer: "Reparación · trabajando"
    await expect(
      page.getByText(/Reparación\s*·\s*trabajando/i),
      "Timer should show activity name and estado"
    ).toBeVisible({ timeout: 10_000 });

    // EstadoPill shows "Trabajando"
    await expect(page.getByText(SEL.estadoTrabajando)).toBeVisible({ timeout: 5_000 });

    // Timer is green (#2C8A4A) — assert via CSS color
    const timerEl = page.locator("div.font-mono.font-bold").first();
    await expect(timerEl).toBeVisible({ timeout: 5_000 });
    const color = await timerEl.evaluate((el) => window.getComputedStyle(el).color);
    // rgb(44, 138, 74) = #2C8A4A
    expect(color, "Timer should be green when TRABAJANDO").toBe("rgb(44, 138, 74)");
  });

  // ── Test 2: Timer avanza ──────────────────────────────────────────────────

  test("timer avanza — no muestra 00:00:00 después de 2s", async ({ page }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);

    // Capture initial timer value
    const timerEl = page.locator("div.font-mono.font-bold").first();
    const initial = await timerEl.textContent();

    // Wait 2.5 seconds
    await page.waitForTimeout(2_500);

    // Timer must not be "00:00:00" (it started from now, so minimal time has passed)
    await expect(timerEl).not.toHaveText("00:00:00");

    // Timer text should have changed (or be non-zero)
    const after = await timerEl.textContent();
    expect(after).not.toBe("00:00:00");
    // Give some leeway — timer may increment every second
    // At minimum 2s elapsed, so seconds value should be > 0 or minutes advanced
    expect(initial).toBeTruthy();
    expect(after).toBeTruthy();
  });

  // ── Test 3: Pausar → amarillo, botón "Reanudar" ───────────────────────────

  test("Pausar → timer amarillo, EstadoPill = En pausa, botón Reanudar visible", async ({
    page,
  }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);
    await expect(page.getByText(SEL.estadoTrabajando)).toBeVisible();

    // Click Pausar
    await page.getByRole("button", { name: SEL.btnPausar }).click();

    // EstadoPill changes to "En pausa"
    await expect(page.getByText(SEL.estadoPausa), "Estado should show En pausa").toBeVisible({
      timeout: 8_000,
    });

    // Timer color changes to yellow (#F4A91A → rgb(244, 169, 26))
    const timerEl = page.locator("div.font-mono.font-bold").first();
    const color = await timerEl.evaluate((el) => window.getComputedStyle(el).color);
    expect(color, "Timer should be yellow when PAUSA").toBe("rgb(244, 169, 26)");

    // "Pausar" button replaced by "Reanudar"
    await expect(page.getByRole("button", { name: SEL.btnReanudar })).toBeVisible();
    await expect(page.getByRole("button", { name: SEL.btnPausar })).not.toBeVisible();
  });

  // ── Test 4: Reanudar → verde, botón "Pausar" ─────────────────────────────

  test("Reanudar → timer verde, EstadoPill = Trabajando, botón Pausar visible", async ({
    page,
  }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);

    // Pause first
    await page.getByRole("button", { name: SEL.btnPausar }).click();
    await expect(page.getByText(SEL.estadoPausa)).toBeVisible({ timeout: 8_000 });

    // Resume
    await page.getByRole("button", { name: SEL.btnReanudar }).click();

    // Should return to TRABAJANDO
    await expect(page.getByText(SEL.estadoTrabajando)).toBeVisible({ timeout: 8_000 });

    // Timer green again
    const timerEl = page.locator("div.font-mono.font-bold").first();
    const color = await timerEl.evaluate((el) => window.getComputedStyle(el).color);
    expect(color, "Timer should be green after resuming").toBe("rgb(44, 138, 74)");

    // "Reanudar" replaced by "Pausar"
    await expect(page.getByRole("button", { name: SEL.btnPausar })).toBeVisible();
    await expect(page.getByRole("button", { name: SEL.btnReanudar })).not.toBeVisible();
  });

  // ── Test 5: Cambiar actividad ─────────────────────────────────────────────

  test("Cambiar a Diagnóstico → label de actividad cambia a Diagnóstico", async ({ page }) => {
    // Start with Reparación
    await seleccionarActividad(page, "Reparación");
    await expect(page.getByText(/Reparación\s*·\s*trabajando/i)).toBeVisible({
      timeout: 10_000,
    });

    // Switch to Diagnóstico via "Cambiar" sheet
    await page.getByRole("button", { name: SEL.btnCambiar }).click();
    await expect(page.getByText(SEL.sheetTitle)).toBeVisible({ timeout: 5_000 });
    await page
      .getByRole("button", { name: /diagnóstico/i })
      .last()
      .click();

    // Handle OF sheet if it appears
    const ofSheet = page.getByText(/¿en qué OF\?/i);
    if (await ofSheet.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await page.getByRole("button", { name: SEL.sinOFBtn }).click();
    }

    // Label should now show "Diagnóstico"
    await expect(
      page.getByText(/Diagnóstico\s*·\s*trabajando/i),
      "Activity label should update to Diagnóstico"
    ).toBeVisible({ timeout: 10_000 });

    // No longer shows Reparación
    await expect(page.getByText(/Reparación\s*·/i)).not.toBeVisible();
  });

  // ── Test 6: Finalizar ─────────────────────────────────────────────────────

  test("Finalizar → timer se detiene, estado vuelve a Disponible", async ({ page }) => {
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);
    await expect(page.getByText(SEL.estadoTrabajando)).toBeVisible();

    await finalizarMarcaje(page);

    // EstadoPill should change to Disponible
    await expect(
      page.getByText(SEL.estadoDisponible),
      "Estado should show Disponible after finalizing"
    ).toBeVisible({ timeout: 10_000 });

    // Timer text shows "00:00:00" or disappears (no active marcaje)
    // The label "Reparación · trabajando" should be gone
    await expect(page.getByText(/Reparación\s*·\s*trabajando/i)).not.toBeVisible({
      timeout: 5_000,
    });

    // Finalizar button should be disabled (no active marcaje)
    const finBtn = page.getByRole("button", { name: SEL.btnFinalizar });
    await expect(finBtn).toBeDisabled({ timeout: 5_000 });
  });

  // ── Test 7: Historial del día ─────────────────────────────────────────────

  test("historial del día muestra los marcajes realizados", async ({ page }) => {
    // Do a complete cycle: start → finalize
    await seleccionarActividad(page, "Reparación");
    await waitForTimer(page);
    await finalizarMarcaje(page);

    // Historial section is always visible in the right column
    await expect(page.getByText(SEL.historialHeading)).toBeVisible({ timeout: 8_000 });

    // After finalizing, at least one marcaje entry should appear in the timeline
    // MarcajeTimeline renders entries with activity name and time
    await expect(
      page.locator("text=/Reparación/i").last(),
      "Historial should show Reparación entry"
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── Test 8: Actividad no-productiva sin OF (Almuerzo) ────────────────────

  test("Almuerzo (no productiva) inicia directamente sin pedir OF", async ({ page }) => {
    await page.getByRole("button", { name: SEL.btnCambiar }).click();
    await expect(page.getByText(SEL.sheetTitle)).toBeVisible({ timeout: 5_000 });

    // Click Almuerzo — should go directly without OF sheet
    await page
      .getByRole("button", { name: /almuerzo/i })
      .last()
      .click();

    // OF selection sheet should NOT appear
    await expect(page.getByText(/¿en qué OF\?/i)).not.toBeVisible({ timeout: 2_000 });

    // Activity starts immediately — label shows Almuerzo
    // EstadoPill for Almuerzo = "Almuerzo" (from ESTADO_CONFIG)
    // Since Almuerzo is non-productive, estado = "DISPONIBLE" (getEstado returns DISPONIBLE for non-productive)
    // But the timer label shows the activity name
    await expect(page.getByText(/almuerzo/i).first()).toBeVisible({ timeout: 10_000 });

    // Finalizar is now enabled
    const finBtn = page.getByRole("button", { name: SEL.btnFinalizar });
    await expect(finBtn).toBeEnabled({ timeout: 8_000 });
  });
});

// ── Kiosco — estado inicial (sin sesión activa) ───────────────────────────────

test.describe("Kiosco — estado inicial", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/marcaje");
    await page.waitForLoadState("networkidle");
  });

  test("muestra pantalla de PIN con teclado numérico completo", async ({ page }) => {
    await expect(page.getByText(/identificación del técnico/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible();

    // All digits 0-9 and DEL/OK buttons present
    for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]) {
      await expect(page.getByRole("button", { name: new RegExp(`^${d}$`) })).toBeVisible();
    }
    // OK (✓) button exists but is disabled with < 4 digits
    const okBtn = page.getByRole("button", { name: /✓|ok/i });
    await expect(okBtn).toBeVisible();
    await expect(okBtn).toBeDisabled();
  });

  test("presionar dígitos llena los indicadores, DEL los borra", async ({ page }) => {
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /^1$/ }).click();
    await page.getByRole("button", { name: /^2$/ }).click();
    await page.getByRole("button", { name: /^3$/ }).click();

    // OK still disabled — only 3 of 4 digits entered
    await expect(page.getByRole("button", { name: /✓|ok/i })).toBeDisabled();

    // DEL button — has a trash/delete icon, unique among digit buttons
    // It's rendered as the 11th button (between 0 and ✓)
    const delBtn = page.locator("button:has(svg)").first(); // first SVG button = del
    await delBtn.click();

    // Back to 2 digits — OK still disabled
    await expect(page.getByRole("button", { name: /✓|ok/i })).toBeDisabled();
  });

  test("PIN incorrecto → texto de error en rojo, se resetea automáticamente", async ({ page }) => {
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({ timeout: 10_000 });

    // Enter wrong PIN
    for (const d of "9999".split("")) {
      await page.getByRole("button", { name: new RegExp(`^${d}$`) }).click();
    }

    // Error message appears
    await expect(page.getByText("PIN inválido")).toBeVisible({ timeout: 5_000 });

    // Dots turn red (CSS class border-red-500 or bg-red-500)
    await expect(page.locator(".border-red-500, .bg-red-500").first()).toBeVisible({
      timeout: 3_000,
    });

    // After ~1.5s, resets automatically — error text disappears
    await expect(page.getByText("PIN inválido")).not.toBeVisible({ timeout: 5_000 });

    // PIN screen still shown
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible();
  });
});
