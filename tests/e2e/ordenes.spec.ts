/**
 * E2E tests — Gestión de Órdenes de Trabajo
 *
 * Precondición: autenticado como JEFE_TALLER (Antofagasta).
 * Session loaded from fixtures/.auth/jefe.json (built by auth.setup.ts).
 *
 * Seed OFs (prisma/seed.ts — Antofagasta):
 *   2512001 — EN_PROCESO,      ALTA,    hhEstimadas: 16
 *   2512002 — PENDIENTE,       MEDIA,   "REPARACION MOTOR" — used for drag & drop
 *   2512003 — ESPERA_REPUESTO, CRITICA, "REPARACION CAJA"
 *
 * Note: the drag & drop test mutates DB state (2512002 PENDIENTE → EN_PROCESO).
 * Run `npx prisma db seed` to restore seed data between sessions.
 */

import { test, expect, type Page } from "@playwright/test";
import { esperarToast, esperarCarga } from "./helpers/waiters";

// ── Auth — session de JEFE_TALLER (generada por auth.setup.ts) ────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

const OF_EN_PROCESO = "2512001";
const OF_PENDIENTE = "2512002";
const OF_ESPERA = "2512003";

const KANBAN_COLUMNS = [
  "Pendiente",
  "En proceso",
  "Pausada",
  "Espera repuesto",
  "Finalizada",
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Find a form input by its label text within the currently open dialog.
 * The DialogOrden Field component renders <label> as a sibling of <input>,
 * not a wrapper, so getByLabel() doesn't work — this navigates via the parent.
 */
function dialogInput(page: Page, labelText: string | RegExp) {
  return page
    .getByRole("dialog")
    .locator("label")
    .filter({ hasText: labelText })
    .locator("..") // Field wrapper div
    .locator("input, textarea")
    .first();
}

/**
 * Wait for the ordenes API to respond after a filter/search change.
 * The search input debounces 300 ms before firing the request.
 */
async function waitForOrdenesResponse(page: Page) {
  await page.waitForResponse(
    (res) =>
      res.url().includes("/api/ordenes") &&
      res.request().method() === "GET" &&
      res.status() === 200,
    { timeout: 6_000 }
  );
  await page.waitForLoadState("networkidle");
}

// ── Vista tabla ───────────────────────────────────────────────────────────────

test.describe("Órdenes — vista tabla (JEFE_TALLER)", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/ordenes");
    await esperarCarga(page);
  });

  // ── 1. Ver lista ─────────────────────────────────────────────────────────

  test("tabla muestra las OFs del seed para Antofagasta", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /órdenes de trabajo/i })).toBeVisible();

    // All 3 seed OFs visible
    await expect(page.getByText(OF_EN_PROCESO)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(OF_PENDIENTE)).toBeVisible();
    await expect(page.getByText(OF_ESPERA)).toBeVisible();

    // Table has data rows (not just skeleton)
    const rows = page.getByRole("row").filter({ hasText: /251200/ });
    await expect(rows).toHaveCount(3, { timeout: 8_000 });
  });

  // ── 2. Buscar por número ──────────────────────────────────────────────────

  test("buscar OF por número → solo aparece la coincidencia", async ({ page }) => {
    await page.getByPlaceholder(/buscar OF/i).fill(OF_PENDIENTE);
    await waitForOrdenesResponse(page);

    // Target OF visible
    await expect(page.getByRole("row").filter({ hasText: OF_PENDIENTE })).toBeVisible({
      timeout: 8_000,
    });

    // Others not visible
    await expect(page.getByRole("row").filter({ hasText: OF_EN_PROCESO })).not.toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: OF_ESPERA })).not.toBeVisible();
  });

  // ── 3. Filtrar por estado ─────────────────────────────────────────────────

  test("filtro 'En proceso' → solo muestra OFs con ese estado", async ({ page }) => {
    await page.getByRole("button", { name: "En proceso" }).click();
    await waitForOrdenesResponse(page);

    // 2512001 is EN_PROCESO
    await expect(page.getByRole("row").filter({ hasText: OF_EN_PROCESO })).toBeVisible({
      timeout: 8_000,
    });

    // 2512002 is PENDIENTE — should not appear
    await expect(page.getByRole("row").filter({ hasText: OF_PENDIENTE })).not.toBeVisible();
  });

  // ── 4. Crear nueva OF ─────────────────────────────────────────────────────

  test("crear nueva OF → aparece en la lista", async ({ page }) => {
    // Unique number to avoid conflicts between test runs
    const ofNumero = `E${Date.now().toString().slice(-6)}`;

    await page.getByRole("button", { name: /nueva OF/i }).click();
    await expect(page.getByRole("heading", { name: /nueva orden de trabajo/i })).toBeVisible({
      timeout: 5_000,
    });

    // Fill required fields
    await page.getByPlaceholder("OF-2026-0001").fill(ofNumero);
    await page.getByPlaceholder(/código o nombre del proyecto/i).fill("PROY-E2E");
    await page.getByPlaceholder(/reparación motor principal/i).fill("Reparacion E2E Automatizada");
    await dialogInput(page, /^Cliente/).fill("Cliente E2E");
    await page.getByPlaceholder(/motor \/ bomba/i).fill("Equipo E2E");
    await page.getByPlaceholder("8").fill("4"); // HH estimadas
    // Sucursal is pre-filled for JEFE_TALLER (cannot be changed)

    await page.getByRole("button", { name: /crear orden/i }).click();

    // Success feedback
    await esperarToast(page, new RegExp(ofNumero), { timeout: 8_000 });

    // Dialog closes and OF appears in table
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(ofNumero)).toBeVisible({ timeout: 8_000 });
  });

  // ── 5. Editar nombre de OF ────────────────────────────────────────────────

  test("editar OF → nombre actualizado en la tabla", async ({ page }) => {
    const nombreNuevo = `Motor E2E-${Date.now().toString().slice(-4)}`;

    // Click row to open detail sheet
    await page.getByRole("row").filter({ hasText: OF_EN_PROCESO }).click();

    // Sheet opens and shows Editar button
    await expect(page.getByRole("button", { name: /^Editar$/i })).toBeVisible({ timeout: 8_000 });

    await page.getByRole("button", { name: /^Editar$/i }).click();

    // Edit dialog opens
    await expect(
      page.getByRole("heading", { name: new RegExp(`editar OF ${OF_EN_PROCESO}`, "i") })
    ).toBeVisible({ timeout: 5_000 });

    // Update the nombre field (always has placeholder regardless of current value)
    const nombreInput = page.getByPlaceholder(/reparación motor principal/i);
    await nombreInput.clear();
    await nombreInput.fill(nombreNuevo);

    await page.getByRole("button", { name: /guardar cambios/i }).click();

    // Toast confirms save
    await esperarToast(page, new RegExp(OF_EN_PROCESO), { timeout: 8_000 });

    // Dialog closes
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });

    // Updated name visible in table
    await expect(page.getByText(nombreNuevo)).toBeVisible({ timeout: 8_000 });
  });

  // ── 6. Sheet de detalle ───────────────────────────────────────────────────

  test("clic en fila → sheet de detalle con datos de la OF", async ({ page }) => {
    await page.getByRole("row").filter({ hasText: OF_ESPERA }).click();

    // Sheet opens
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 8_000 });

    // OF number present in sheet
    await expect(sheet.getByText(OF_ESPERA)).toBeVisible();

    // JEFE_TALLER sees the edit button
    await expect(sheet.getByRole("button", { name: /^Editar$/i })).toBeVisible();
  });

  // ── 7. Validación al crear con campos vacíos ──────────────────────────────

  test("crear OF con campos vacíos → errores de validación visibles", async ({ page }) => {
    await page.getByRole("button", { name: /nueva OF/i }).click();
    await expect(page.getByRole("heading", { name: /nueva orden de trabajo/i })).toBeVisible({
      timeout: 5_000,
    });

    // Submit immediately without filling anything
    await page.getByRole("button", { name: /crear orden/i }).click();

    // Global error banner
    await expect(page.getByText(/hay campos con errores/i)).toBeVisible({ timeout: 5_000 });

    // Individual field errors from Zod schema
    await expect(page.getByText("El número de OF es requerido")).toBeVisible();
    await expect(page.getByText("El proyecto es requerido")).toBeVisible();
    await expect(page.getByText("El nombre es requerido")).toBeVisible();
    await expect(page.getByText("El cliente es requerido")).toBeVisible();
    await expect(page.getByText("El equipo es requerido")).toBeVisible();

    // Dialog stays open — user must correct errors
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

// ── Vista kanban ──────────────────────────────────────────────────────────────

test.describe("Órdenes — vista kanban (JEFE_TALLER)", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/ordenes");
    await esperarCarga(page);
    await page.getByRole("tab", { name: /^Kanban$/i }).click();
    await page.waitForLoadState("networkidle");
  });

  // ── 8. Columnas visibles ──────────────────────────────────────────────────

  test("kanban muestra las 5 columnas de estado con cards", async ({ page }) => {
    // All 5 state columns visible
    for (const label of KANBAN_COLUMNS) {
      await expect(
        page.getByText(label, { exact: true }).first(),
        `Kanban column "${label}" must be visible`
      ).toBeVisible({ timeout: 8_000 });
    }

    // Seed cards appear in their respective columns
    await expect(page.getByText(OF_EN_PROCESO)).toBeVisible();
    await expect(page.getByText(OF_PENDIENTE)).toBeVisible();
    await expect(page.getByText(OF_ESPERA)).toBeVisible();
  });

  // ── 9. Drag & drop ───────────────────────────────────────────────────────

  test("drag & drop mueve OF de Pendiente a En proceso", async ({ page }) => {
    test.slow(); // Allow extra time for pointer event processing

    // Source: OF 2512002 (PENDIENTE) draggable card
    // dnd-kit's useDraggable adds role="button" to the drag handle wrapper
    const sourceCard = page.getByRole("button").filter({ hasText: OF_PENDIENTE }).first();
    await expect(sourceCard).toBeVisible({ timeout: 8_000 });

    // Target: the cards drop zone inside the "En proceso" column.
    // KanbanColumn structure (from kanban-ordenes.tsx):
    //   <div class="min-w-[272px]...">          ← column root
    //     <div class="px-3 py-2.5 ...">          ← header (contains the label text)
    //       <div class="flex items-center gap-2">
    //         <span>·</span>
    //         <span class="text-sm font-semibold">"En proceso"</span>  ← label (3 levels up from column)
    //       </div>
    //     </div>
    //     <div ref={setNodeRef} class="flex-1 flex flex-col ...">  ← DROP ZONE
    //       {cards}
    //     </div>
    //   </div>
    //
    // Navigate: label text → up 3 levels → column root → find cards drop zone
    const enProcesoLabel = page.getByText("En proceso", { exact: true }).first();
    const enProcesoColumnRoot = enProcesoLabel.locator("../../..");
    const enProcesoDropZone = enProcesoColumnRoot.locator("div.flex-1.flex.flex-col").first();

    await expect(enProcesoDropZone).toBeVisible({ timeout: 5_000 });

    // Use page.mouse for reliable dnd-kit PointerSensor activation.
    // The PointerSensor requires distance >= 8px before activating the drag.
    const srcBox = await sourceCard.boundingBox();
    const tgtBox = await enProcesoDropZone.boundingBox();

    if (!srcBox || !tgtBox) {
      throw new Error("Bounding boxes not available for drag operation");
    }

    const srcX = srcBox.x + srcBox.width / 2;
    const srcY = srcBox.y + srcBox.height / 2;
    const tgtX = tgtBox.x + tgtBox.width / 2;
    // Target 60px from top of drop zone to ensure we're past the header
    const tgtY = tgtBox.y + 60;

    await page.mouse.move(srcX, srcY);
    await page.mouse.down();
    // Small initial move to satisfy the 8px activation constraint
    await page.mouse.move(srcX + 5, srcY + 2, { steps: 3 });
    // Slow move to target (steps generates intermediate pointermove events)
    await page.mouse.move(tgtX, tgtY, { steps: 15 });
    await page.mouse.up();

    // Toast confirms the state change
    await esperarToast(page, new RegExp(`${OF_PENDIENTE}.*en proceso`, "i"), { timeout: 8_000 });

    // Card appears in En proceso column
    await expect(enProcesoDropZone.getByText(OF_PENDIENTE)).toBeVisible({
      timeout: 5_000,
    });

    // Card no longer in Pendiente column
    const pendienteLabel = page.getByText("Pendiente", { exact: true }).first();
    const pendienteDropZone = pendienteLabel
      .locator("../../..")
      .locator("div.flex-1.flex.flex-col")
      .first();
    await expect(pendienteDropZone.getByText(OF_PENDIENTE)).not.toBeVisible({
      timeout: 3_000,
    });
  });
});
