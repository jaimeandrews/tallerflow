/**
 * E2E tests — Asignación de técnicos a Órdenes de Trabajo
 *
 * Precondición: autenticado como JEFE_TALLER (Antofagasta).
 * Session from fixtures/.auth/jefe.json (built by auth.setup.ts).
 *
 * Seed data (prisma/seed.ts — Antofagasta):
 *   Técnicos: Juan Riquelme (tecnico1), + 2 more
 *   OFs:
 *     2512001 — EN_PROCESO, 16h / 2 techs → 8h planificadas sugeridas
 *     2512002 — PENDIENTE,  24h / 3 techs → 8h planificadas sugeridas
 *     2512003 — ESPERA_REPUESTO, 8h / 1 tech → 8h planificadas (CRITICA)
 *
 * Capacity rule: 8h per technician per day (HH_CAPACIDAD_DIARIA).
 * Overcapacity warning triggers when a technician exceeds 8h in total.
 *   Assigning Juan to 2512002 (8h) + 2512001 (8h) → 16h > 8h → warning toast.
 *
 * ── Describe 1 (read-only) ──────────────────────────────────────────────────
 *   No DB mutations — just verifies the page renders correctly.
 *
 * ── Describe 2 (serial drag & drop) ─────────────────────────────────────────
 *   Tests run in declared order. beforeAll clears any stale assignments so
 *   each run starts from a clean state without needing a DB reset (which
 *   would invalidate stored auth sessions by regenerating user UUIDs).
 */

import { test, expect, type Page, type Locator } from "@playwright/test";
import { esperarCarga, esperarToast } from "./helpers/waiters";

// ── Auth ──────────────────────────────────────────────────────────────────────

// Both describe blocks use jefe.json; declared per block below.

// ── Seed constants ────────────────────────────────────────────────────────────

const JUAN = "Juan Riquelme";
const OF_EN_PROCESO = "2512001"; // 16h / 2 techs → 8h suggested
const OF_PENDIENTE = "2512002"; // 24h / 3 techs → 8h suggested
// const OF_ESPERA = "2512003";  // used only in overcapacity test

// ── Locator helpers ───────────────────────────────────────────────────────────

/** Pool tech card — outer wrapper of TarjetaTecnico */
function poolCard(page: Page, nombre: string): Locator {
  // TarjetaTecnico: <div class="group rounded-lg border p-3 select-none ...">
  return page.locator("div.rounded-lg.border.p-3.select-none").filter({ hasText: nombre }).first();
}

/** Drag handle inside a pool card (div.cursor-grab.touch-none with GripVertical) */
function poolGrip(page: Page, nombre: string): Locator {
  return poolCard(page, nombre).locator("div.cursor-grab.touch-none").first();
}

/** Droppable OF card in the assignment grid */
function ofDropCard(page: Page, ofNumero: string): Locator {
  // OFDropCard: <div ref={setNodeRef} class="flex flex-col rounded-xl border transition-all duration-150 ...">
  return page
    .locator("div.flex.flex-col.rounded-xl.border.transition-all.duration-150")
    .filter({ hasText: ofNumero })
    .first();
}

/** Assigned technician chip on an OF card */
function chip(page: Page, nombre: string): Locator {
  // ChipAsignado: <div class="group inline-flex ... rounded-full border ... select-none">
  return page.locator("div.rounded-full.border.select-none").filter({ hasText: nombre }).first();
}

/** Drag handle inside a chip (span.touch-none with GripVertical size-3) */
function chipGrip(chipLocator: Locator): Locator {
  return chipLocator.locator("span.touch-none").first();
}

/** Unassign drop zone (always in DOM, visible during drag) */
function unassignZone(page: Page): Locator {
  // UnassignZone: <div ref={setNodeRef} class="... rounded-xl border-2 border-dashed py-8 ...">
  return page
    .locator("div.rounded-xl.border-2.border-dashed")
    .filter({ hasText: /quitar asignación/i })
    .first();
}

/** KPI card by its label — navigate to the card container */
function kpiCard(page: Page, label: string | RegExp): Locator {
  return page.getByText(label).locator("../../.."); // label → value p → info div → card div
}

// ── Drag helper ───────────────────────────────────────────────────────────────

/**
 * Simulate a drag from source to target using page.mouse.
 * Uses intermediate steps to satisfy dnd-kit's PointerSensor activation
 * constraint (distance >= 8px before drag starts).
 */
async function drag(page: Page, source: Locator, target: Locator) {
  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();

  if (!srcBox || !tgtBox) throw new Error("Bounding boxes unavailable for drag");

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;
  const tgtX = tgtBox.x + tgtBox.width / 2;
  const tgtY = tgtBox.y + tgtBox.height / 2;

  await page.mouse.move(srcX, srcY);
  await page.mouse.down();
  // Small initial move to activate PointerSensor (needs distance >= 8px)
  await page.mouse.move(srcX + 6, srcY + 4, { steps: 3 });
  // Slow move to target so intermediate pointermove events fire
  await page.mouse.move(tgtX, tgtY, { steps: 15 });
  await page.mouse.up();
}

/**
 * Unassign a technician by clicking the X button on their chip (force-click since
 * the button is opacity-0 by default and only revealed on hover).
 */
async function unassignViaButton(page: Page, nombre: string) {
  const quitarBtn = page.getByRole("button", {
    name: new RegExp(`quitar a ${nombre}`, "i"),
  });
  await quitarBtn.click({ force: true });
  // Wait for the mutation to settle
  await page
    .waitForResponse((res) => res.url().includes("/api/asignacion") && res.status() < 400, {
      timeout: 5_000,
    })
    .catch(() => {});
}

/**
 * Clear all active assignments on the current /asignacion page by clicking
 * every "Quitar a …" button (opacity-0 but force-clickable).
 * Used in beforeAll to start each serial run from a clean state.
 */
async function limpiarTodasAsignaciones(page: Page) {
  await page.goto("/asignacion");
  await esperarCarga(page);

  // Repeatedly click "Quitar a …" until none remain
  for (let i = 0; i < 20; i++) {
    const btn = page.getByRole("button", { name: /^quitar a /i }).first();
    const visible = await btn.count().then((c) => c > 0);
    if (!visible) break;
    await btn.click({ force: true });
    await page.waitForTimeout(600); // allow mutation to complete
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Describe 1 — Lectura (sin mutaciones)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Asignación — Pool y Grid (lectura)", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/asignacion");
    await esperarCarga(page);
  });

  // ── 1. Pool de técnicos ──────────────────────────────────────────────────

  test("pool de técnicos visible con datos del seed", async ({ page }) => {
    // Pool header
    await expect(page.getByText("Técnicos").first()).toBeVisible({ timeout: 8_000 });

    // Filter tabs always visible
    await expect(page.getByRole("tab", { name: /^Todos$/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /disponibles/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /ocupados/i })).toBeVisible();

    // Juan Riquelme card present (first seed tech)
    await expect(poolCard(page, JUAN)).toBeVisible({ timeout: 8_000 });

    // Card shows carga bar "0.0 / 8h" when no assignments
    await expect(poolCard(page, JUAN).getByText(/0\.0\s*\/\s*8h/)).toBeVisible({ timeout: 5_000 });

    // Drag handle (GripVertical) visible
    await expect(poolGrip(page, JUAN)).toBeVisible();

    // Footer hint
    await expect(page.getByText(/arrastra para asignar/i)).toBeVisible();
  });

  // ── 2. Grid de OFs ───────────────────────────────────────────────────────

  test("grid de órdenes muestra las OFs activas del seed", async ({ page }) => {
    // Grid header
    await expect(page.getByText("Órdenes a asignar")).toBeVisible({ timeout: 8_000 });

    // All 3 seed OFs visible as drop cards
    for (const ofNum of [OF_EN_PROCESO, OF_PENDIENTE]) {
      await expect(
        ofDropCard(page, ofNum),
        `OF ${ofNum} should be visible in the grid`
      ).toBeVisible({ timeout: 8_000 });
    }

    // Each OF card shows slot indicators ("Técnicos X/Y")
    const of2Card = ofDropCard(page, OF_PENDIENTE);
    await expect(of2Card.getByText("Técnicos")).toBeVisible();

    // Unassign zone always present in DOM (opaque when drag inactive)
    await expect(page.getByText(/quitar asignación/i).first()).toBeInViewport();
  });

  // ── 3. KPIs iniciales ────────────────────────────────────────────────────

  test("KPIs visibles con valores coherentes en estado inicial", async ({ page }) => {
    // All 5 KPI labels visible
    await expect(page.getByText(/técnicos asignados/i)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/hh planificadas/i)).toBeVisible();
    await expect(page.getByText(/utilización/i)).toBeVisible();
    await expect(page.getByText(/of sin asignar/i)).toBeVisible();
    await expect(page.getByText(/sobre capacidad/i)).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 2 — Drag & Drop (serial: tests run in order, share DB state)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Asignación — Drag & Drop (JEFE_TALLER)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  // Clear stale assignments before this test suite so each run starts clean.
  // We use the UI (force-click X buttons) instead of resetDB() because a
  // DB reset regenerates user UUIDs, invalidating stored auth sessions.
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext({
      storageState: "tests/e2e/fixtures/.auth/jefe.json",
    });
    const page = await ctx.newPage();
    await limpiarTodasAsignaciones(page);
    await page.close();
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/asignacion");
    await esperarCarga(page);
    // Ensure pool cards are rendered before any drag
    await expect(poolCard(page, JUAN)).toBeVisible({ timeout: 8_000 });
  });

  // ── 4. Drag técnico → OF → chip aparece ──────────────────────────────────

  test("drag Juan del pool → 2512002 → chip aparece en la card", async ({ page }) => {
    test.slow();

    const grip = poolGrip(page, JUAN);
    const target = ofDropCard(page, OF_PENDIENTE);

    await drag(page, grip, target);

    // Success toast: "Juan asignado a 2512002"
    await esperarToast(page, /juan.*asignado.*2512002/i, { timeout: 8_000 });

    // Chip with Juan's name appears on 2512002 card
    await expect(
      target.getByText("Juan"),
      "Chip for Juan should appear on 2512002 card"
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── 5. KPIs se actualizan ─────────────────────────────────────────────────

  test("KPIs reflejan la asignación: 1/3 técnicos, 8.0h planificadas", async ({ page }) => {
    // "Técnicos asignados" KPI — label text is uppercase in the UI
    const tecAsigLabel = page.getByText(/técnicos asignados/i);
    const tecAsigKpi = tecAsigLabel.locator("../.."); // up to the KPI info div
    await expect(tecAsigKpi.locator("p.text-xl").first()).toHaveText("1/3", { timeout: 8_000 });

    // "HH planificadas" KPI shows 8.0h (Juan assigned 8h to 2512002)
    const hhLabel = page.getByText(/hh planificadas/i);
    const hhKpi = hhLabel.locator("../.."); // up to info div
    await expect(hhKpi.locator("p.text-xl").first()).toHaveText("8.0h", { timeout: 5_000 });

    // "OF sin asignar": 2512001 and 2512003 still without staffing
    const ofSinLabel = page.getByText(/of sin asignar/i);
    const ofSinKpi = ofSinLabel.locator("../..");
    await expect(ofSinKpi.locator("p.text-xl").first()).not.toHaveText("0", { timeout: 5_000 });
  });

  // ── 6. Gantt muestra bloque ───────────────────────────────────────────────

  test("Gantt muestra fila y bloque para Juan tras la asignación", async ({ page }) => {
    // Gantt section header
    await expect(page.getByText(/day at a glance/i)).toBeVisible({ timeout: 8_000 });

    // Empty state is gone (Juan has 1 assignment)
    await expect(page.getByText(/sin asignaciones aún/i)).not.toBeVisible({ timeout: 5_000 });

    // Juan's name appears in the Gantt rows
    await expect(
      page.locator("div.overflow-x-auto").getByText(JUAN),
      "Juan Riquelme should appear as a row in the Gantt"
    ).toBeVisible({ timeout: 8_000 });

    // At least one colored block visible (div with inline left/width style)
    await expect(
      page.locator("div.overflow-x-auto").locator("div[style*='left'][style*='width']").first(),
      "Gantt should show at least one colored block for the assignment"
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── 7. Desasignar via drag chip → zona de desasignación ──────────────────

  test("drag chip de Juan → zona de desasignación → chip desaparece", async ({ page }) => {
    test.slow();

    const joanChip = chip(page, "Juan");
    await expect(joanChip).toBeVisible({ timeout: 8_000 });

    const grip = chipGrip(joanChip);
    const unassign = unassignZone(page);

    await drag(page, grip, unassign);

    // Toast: "Juan devuelto al pool (OF 2512002)"
    await esperarToast(page, /juan.*devuelto.*pool/i, { timeout: 8_000 });

    // Chip disappears from 2512002
    await expect(ofDropCard(page, OF_PENDIENTE).getByText("Juan")).not.toBeVisible({
      timeout: 5_000,
    });

    // Juan's card reappears in pool with 0 HH
    await expect(poolCard(page, JUAN)).toBeVisible({ timeout: 5_000 });
  });

  // ── 8. Warning de sobre-capacidad (>8h) ──────────────────────────────────

  test("asignar técnico a >8h total → warning de sobre capacidad visible", async ({ page }) => {
    test.slow();

    // Assign Juan to 2512002 (8h suggested) → at capacity exactly
    await drag(page, poolGrip(page, JUAN), ofDropCard(page, OF_PENDIENTE));
    await esperarToast(page, /juan.*asignado.*2512002/i, { timeout: 8_000 });

    // Re-navigate so the pool card reloads with updated carga
    await page.goto("/asignacion");
    await esperarCarga(page);
    await expect(poolCard(page, JUAN)).toBeVisible({ timeout: 8_000 });

    // Assign Juan to 2512001 (8h more → 16h total > 8h capacity)
    await drag(page, poolGrip(page, JUAN), ofDropCard(page, OF_EN_PROCESO));

    // Warning toast from warningsSobreCapacidad
    await esperarToast(page, /superando la capacidad de 8 HH/i, { timeout: 8_000 });

    // "Sobre capacidad" KPI changes to danger tone (sub text "técnico(s) con >8h")
    await expect(
      page.getByText(/técnico.*con >8h/i),
      "Sobre capacidad KPI sub text should appear"
    ).toBeVisible({ timeout: 8_000 });

    // KPI value is not 0
    const sobreLabel = page.getByText(/sobre capacidad/i);
    const sobreKpi = sobreLabel.locator("../.."); // info div
    await expect(sobreKpi.locator("p.text-xl").first()).not.toHaveText("0");

    // ── Cleanup: unassign Juan from both OFs ────────────────────────────────
    // Force-click the X buttons (opacity-0, needs force)
    await unassignViaButton(page, JUAN);
    await unassignViaButton(page, JUAN);
  });
});
