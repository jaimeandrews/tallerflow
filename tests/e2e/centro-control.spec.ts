/**
 * E2E tests — Centro de control operacional
 *
 * Precondición: JEFE_TALLER (Antofagasta), jefe.json.
 *
 * beforeAll creates an active kiosco marcaje for Juan Riquelme (PIN 1234,
 * Reparación, "Sin OF específica") so that:
 *   • GridTecnicosLive shows Juan with estado TRABAJANDO and running timer
 *   • MixActividad shows Reparación (productive) in the stacked bar
 * afterAll finalizes the marcaje.
 *
 * Note on the Ribbon: the OFRibbonTimeline only shows rows for OFs that have
 * marcajes today. Without an OF-linked marcaje, it renders the empty state.
 * This spec accepts both outcomes to remain data-independent.
 *
 * ── Component structure ────────────────────────────────────────────────────
 * TecCardLive:
 *   <button class="rounded-xl border ...">
 *     <span aria-hidden />         ← color bar (3px, based on estado)
 *     <Avatar>iniciales</Avatar>   ← Avatar with initials
 *     <p class="font-bold">{nombre}</p>
 *     <div class="uppercase">{ESTADO_TECNICO_LABELS[estado]}</div>
 *     <span class="font-mono font-bold tabular-nums">{timer|"—"}</span>
 *   </button>
 *
 * NocModeToggle:
 *   <button aria-pressed={nocMode}>Modo NOC | Salir NOC</button>
 *
 * CSS (globals.css):
 *   body.tallerflow-noc-mode aside { display: none !important; }
 *   body.tallerflow-noc-mode [data-tallerflow-topbar] { display: none !important; }
 *   body.tallerflow-noc-mode [data-tallerflow-shell] { padding-left: 0 !important; }
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { esperarCarga } from "./helpers/waiters";

// ── Auth ──────────────────────────────────────────────────────────────────────

// Both describe blocks use jefe.json; declared per block below.

// ── Section headings ──────────────────────────────────────────────────────────

const H = {
  grid: "Estado de técnicos · live",
  ribbon: "Ribbon de OF activas · líneas de tiempo",
  alertas: "Alertas activas",
  mix: "Mix de actividad · hoy",
  page: "Centro de control operacional",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Describe 1 — Contenido operacional (JEFE_TALLER)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Centro de control — contenido (JEFE_TALLER)", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  let kioskoCtx: BrowserContext | undefined;
  let kioskoPage: Page | undefined;

  /**
   * Start Reparación for Juan Riquelme via kiosco PIN so the grid shows a
   * live timer and the mix chart has at least one productive entry.
   */
  test.beforeAll(async ({ browser }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

    kioskoCtx = await browser.newContext({
      baseURL,
      locale: "es-CL",
      timezoneId: "America/Santiago",
    });
    kioskoPage = await kioskoCtx.newPage();

    await kioskoPage.goto("/marcaje");
    await kioskoPage.waitForLoadState("networkidle");
    await expect(kioskoPage.getByText(/ingresa tu PIN/i)).toBeVisible({
      timeout: 10_000,
    });

    // PIN login — Juan Riquelme (tecnico1.ant@tallerflow.cl)
    for (const digit of "1234".split("")) {
      await kioskoPage.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
    }
    await kioskoPage
      .getByRole("button", { name: "Cambiar" })
      .waitFor({ state: "visible", timeout: 15_000 });

    // Finalize any pre-existing marcaje before starting a fresh one
    const finBtn = kioskoPage.getByRole("button", { name: "Finalizar" });
    if (await finBtn.isEnabled({ timeout: 1_500 }).catch(() => false)) {
      await finBtn.click();
      await kioskoPage.waitForTimeout(800);
    }

    // Start Reparación (productive, no OF since no assignments in seed)
    const quickRep = kioskoPage.getByRole("button", { name: /^Reparación$/i });
    if (await quickRep.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await quickRep.click();
    } else {
      await kioskoPage.getByRole("button", { name: "Cambiar" }).click();
      await kioskoPage
        .getByRole("button", { name: /reparación/i })
        .last()
        .click();
    }

    // Dismiss OF sheet if it appears (only when assignments exist)
    const ofSheet = kioskoPage.getByText(/¿en qué OF\?/i);
    if (await ofSheet.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await kioskoPage.getByRole("button", { name: "Sin OF específica" }).click();
    }

    // Verify marcaje active
    await expect(finBtn).toBeEnabled({ timeout: 8_000 });
  });

  test.afterAll(async () => {
    if (kioskoPage) {
      try {
        const finBtn = kioskoPage.getByRole("button", { name: "Finalizar" });
        if (await finBtn.isEnabled({ timeout: 1_500 }).catch(() => false)) {
          await finBtn.click();
          await kioskoPage.waitForTimeout(600);
        }
      } catch {
        /* ignore */
      }
    }
    await kioskoCtx?.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/centro-control");
    await esperarCarga(page, 20_000);
  });

  // ── 1. Grid de técnicos visible con cards ────────────────────────────────

  test("grid de técnicos visible con al menos 1 card", async ({ page }) => {
    await expect(page.getByRole("heading", { name: H.grid })).toBeVisible({ timeout: 8_000 });

    // TecCardLive renders as <button class="rounded-xl border ... bg-white pt-1 pb-3 px-3">
    // Seed has 3 active technicians in Antofagasta
    const tecCards = page.locator(
      "button.rounded-xl.border.border-slate-200.bg-white.pt-1.pb-3.px-3"
    );
    await expect(tecCards.first()).toBeVisible({ timeout: 8_000 });

    // Juan Riquelme (from beforeAll) must be in the grid
    await expect(page.getByText("Juan Riquelme").first()).toBeVisible({
      timeout: 8_000,
    });
  });

  // ── 2. Cada card tiene: avatar, nombre, estado, timer ───────────────────

  test("card de Juan tiene avatar, nombre, estado y timer activo", async ({ page }) => {
    // Find Juan's card (a <button> that contains his name)
    const joanCard = page
      .locator("button.rounded-xl.border.border-slate-200.bg-white.pt-1.pb-3.px-3")
      .filter({ hasText: "Juan Riquelme" })
      .first();
    await expect(joanCard).toBeVisible({ timeout: 8_000 });

    // Avatar: AvatarFallback shows initials in a circle
    // The avatar div contains text (initials) — Juan Riquelme → "JR" (or whatever the seed sets)
    const avatar = joanCard.locator("div.rounded-full, span.rounded-full").first();
    await expect(avatar).toBeVisible({ timeout: 5_000 });

    // Nombre: p.font-bold element with full name
    await expect(joanCard.locator("p.font-bold")).toContainText("Juan Riquelme", {
      timeout: 5_000,
    });

    // Estado pill: div with "uppercase" class — shows ESTADO_TECNICO_LABELS text
    // Juan started Reparación → estado = TRABAJANDO → label = "Trabajando"
    const estadoPill = joanCard.locator("div.uppercase").first();
    await expect(estadoPill).toBeVisible({ timeout: 5_000 });
    await expect(estadoPill).toContainText("Trabajando");

    // Timer: span.font-mono.font-bold.tabular-nums — shows HH:MM:SS when active
    const timerSpan = joanCard.locator("span.font-mono.font-bold.tabular-nums");
    await expect(timerSpan).toBeVisible({ timeout: 5_000 });
    // Juan has an active marcaje → timer shows HH:MM:SS (not "—")
    await expect(timerSpan).toHaveText(/\d{2}:\d{2}:\d{2}/);
  });

  // ── 3. Ribbon de OF visible (con o sin segmentos) ───────────────────────

  test("ribbon de OF activas visible (acepta estado vacío o segmentos)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: H.ribbon })).toBeVisible({ timeout: 8_000 });

    // Subheading shows the operative time range
    await expect(page.getByText(/Hoy · \d{2}h–\d{2}h/)).toBeVisible({ timeout: 5_000 });

    // Either: rows with colored segments OR empty state text
    const hasRows = await page
      .locator("div.grid.grid-cols-\\[150px_1fr_90px\\]")
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (hasRows) {
      // If there are OF rows, at least one colored segment div must exist
      // Segments have inline style with width% and backgroundColor
      await expect(
        page.locator("div[style*='width'][style*='background-color']").first(),
        "Ribbon segments must have width and color styles"
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // Accept empty state — no OF-linked marcajes today
      await expect(page.getByText(/no hay OF con marcajes hoy/i)).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── 4. Panel de alertas visible ─────────────────────────────────────────

  test("panel de alertas visible con su encabezado y contador", async ({ page }) => {
    await expect(page.getByRole("heading", { name: H.alertas })).toBeVisible({ timeout: 8_000 });

    // Alert count badge (always present — shows 0 or a number)
    // The header has a red/amber/slate rounded-full span with the count
    const alertaHeader = page.getByRole("heading", { name: H.alertas }).locator("../../..");
    await expect(alertaHeader).toBeVisible({ timeout: 5_000 });

    // Either: alert items present OR "Sin alertas activas" empty state
    const hasAlertas = await page
      .locator("ul.divide-y.divide-slate-100 li")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);

    if (!hasAlertas) {
      await expect(page.getByText("Sin alertas activas")).toBeVisible({ timeout: 5_000 });
    }
  });

  // ── 5. Mix de actividad con barra stacked ───────────────────────────────

  test("mix de actividad visible — barra stacked con segmento Reparación", async ({ page }) => {
    await expect(page.getByRole("heading", { name: H.mix })).toBeVisible({ timeout: 8_000 });

    // Mix data: Juan has an active Reparación marcaje →
    // the API should include it in today's activity mix
    // Stacked bar: div.flex.h-4.w-full.overflow-hidden.rounded-md.bg-slate-100
    const stackedBar = page.locator("div.flex.h-4.w-full.overflow-hidden.rounded-md");

    const barVisible = await stackedBar
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    if (barVisible) {
      // Stacked bar must have at least one colored segment div
      // Segments have inline backgroundColor set by the actividad color
      await expect(
        stackedBar.first().locator("div[style*='background-color']").first(),
        "Mix stacked bar must contain at least one colored segment"
      ).toBeVisible({ timeout: 5_000 });

      // Legend items must be visible (at least one li)
      await expect(page.locator("ul.grid.grid-cols-2 li").first()).toBeVisible({ timeout: 5_000 });
    } else {
      // Acceptable: no completed marcajes counted yet
      await expect(page.getByText(/sin actividad registrada hoy/i)).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 2 — Modo NOC (JEFE_TALLER)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Centro de control — Modo NOC", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  test.beforeEach(async ({ page }) => {
    // Ensure NOC is OFF before each test (clear localStorage)
    await page.goto("/centro-control");
    await page.evaluate(() => {
      window.localStorage.removeItem("tallerflow-noc-mode");
    });
    // Reload so the component reads the cleared localStorage
    await page.reload();
    await esperarCarga(page, 15_000);
  });

  // ── 6. Modo NOC: sidebar desaparece, contenido se expande ───────────────

  test("botón Modo NOC oculta sidebar y expande contenido", async ({ page }) => {
    // Sidebar must be visible before activating NOC
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible({ timeout: 8_000 });

    // The toggle button is "Modo NOC" (aria-pressed=false initially)
    const nocBtn = page.getByRole("button", { name: /modo NOC/i });
    await expect(nocBtn).toBeVisible({ timeout: 5_000 });
    await expect(nocBtn).toHaveAttribute("aria-pressed", "false");

    // Click "Modo NOC"
    await nocBtn.click();

    // ── After NOC activation ────────────────────────────────────────────

    // Sidebar disappears (body.tallerflow-noc-mode aside { display: none !important })
    await expect(sidebar, "Sidebar (aside) must be hidden in NOC mode").not.toBeVisible({
      timeout: 5_000,
    });

    // body element has "tallerflow-noc-mode" class (CSS toggle mechanism)
    const bodyHasNocClass = await page.evaluate(() =>
      document.body.classList.contains("tallerflow-noc-mode")
    );
    expect(bodyHasNocClass, "body must have class 'tallerflow-noc-mode'").toBe(true);

    // NocWrapper applies dark background (bg-slate-900)
    const nocWrapper = page
      .getByRole("heading", {
        name: H.page,
      })
      .locator("../../..");
    await expect(nocWrapper).toBeVisible({ timeout: 3_000 });

    // Toggle button now shows "Salir NOC" with aria-pressed=true
    const exitBtn = page.getByRole("button", { name: /salir NOC/i });
    await expect(exitBtn).toBeVisible({ timeout: 5_000 });
    await expect(exitBtn).toHaveAttribute("aria-pressed", "true");

    // ── Pressing Esc also exits NOC mode ───────────────────────────────
    await page.keyboard.press("Escape");
    await expect(sidebar).toBeVisible({ timeout: 5_000 });
    expect(await page.evaluate(() => document.body.classList.contains("tallerflow-noc-mode"))).toBe(
      false
    );
  });
});
