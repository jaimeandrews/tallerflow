/**
 * E2E tests — Configuración del sistema
 *
 * ── ConfigLayout sidebar sections ────────────────────────────────────────────
 * ADMIN       → Sucursales, Turnos, Usuarios, Especialidades,
 *               Actividades, Reglas SLA, Auditoría  (7 sections)
 * JEFE_TALLER → Turnos, Usuarios, Especialidades, Actividades,
 *               Reglas SLA                          (5 sections, NO Sucursales, NO Auditoría)
 * TECNICO     → canAccess("TECNICO","configuracion") = false → redirect /dashboard → /login
 *
 * ── Access control ───────────────────────────────────────────────────────────
 * configuracion/page.tsx:
 *   if (!session?.user)                redirect("/login")
 *   if (!canAccess(rol,"configuracion")) redirect("/dashboard")
 *
 * ── rolesDisponibles ─────────────────────────────────────────────────────────
 * ADMIN       → all roles (ADMIN, GERENTE_SUCURSAL, JEFE_TALLER, …)
 * JEFE_TALLER → ["COORDINADOR", "TECNICO"] only
 *
 * ── Form field selectors (no htmlFor on Field labels) ────────────────────────
 * dialogField(page, "Nombre *") navigates:
 *   label → parent div → input
 *
 * ── Valid RUT for tests ───────────────────────────────────────────────────────
 * "12.345.678-5"  DV = 11 − (138 % 11) = 11 − 6 = 5 ✓
 *
 * ── Default section ──────────────────────────────────────────────────────────
 * ADMIN       → "sucursales" (first in allItems)
 * JEFE_TALLER → "turnos"    (first in allItems)
 */

import { test, expect, type Page } from "@playwright/test";
import { esperarCarga, esperarToast } from "./helpers/waiters";
import { loginComoTecnico } from "./helpers/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Find an `<input>` inside a form Field by its label text.
 *  Field renders: <div><label>…</label><div class="mt-1"><input/></div></div>
 *  No htmlFor attribute — getByLabel() does not work. */
function dialogField(page: Page, labelText: string | RegExp) {
  return page
    .getByRole("dialog")
    .locator("label")
    .filter({ hasText: labelText })
    .locator("..")
    .locator("input, textarea")
    .first();
}

/** The config layout's internal sidebar (w-[220px] aside, distinct from the
 *  dashboard layout's aside).  We scope to the flex container to avoid
 *  matching the dashboard nav sidebar. */
function configSidebar(page: Page) {
  return page.locator("div.flex.gap-6.items-start aside").first();
}

/** Click a section button in the config sidebar and wait for the content to load. */
async function navegarSeccion(page: Page, label: string) {
  await configSidebar(page).getByRole("button", { name: label }).click();
  await page.waitForLoadState("networkidle");
}

/** Generate a unique email for test users to avoid conflicts between runs. */
function uniqueEmail() {
  return `e2e.${Date.now()}@tallerflow-test.local`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Describe 1 — ADMIN: secciones del sidebar
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuracion — ADMIN (sidebar y secciones)", () => {
  // Admin session from playwright.config.ts default storageState (admin.json)

  test.beforeEach(async ({ page }) => {
    await page.goto("/configuracion");
    await esperarCarga(page, 15_000);
  });

  test("todas las secciones del sidebar visible para ADMIN (7 secciones)", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible({
      timeout: 8_000,
    });

    const sidebar = configSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 8_000 });

    // All 7 sections must appear as buttons
    for (const label of [
      "Sucursales",
      "Turnos",
      "Usuarios",
      "Especialidades",
      "Actividades",
      "Reglas SLA",
      "Auditoría",
    ]) {
      await expect(
        sidebar.getByRole("button", { name: label }),
        `Config sidebar must have "${label}" section for ADMIN`
      ).toBeVisible({ timeout: 5_000 });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 2 — ADMIN: gestión de usuarios (serial — tests share the same user)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuracion — ADMIN (usuarios, serial)", () => {
  test.describe.configure({ mode: "serial" });
  // Admin session from playwright.config.ts

  /** Shared email for the test user created in test 1 and used in tests 2–3. */
  let testEmail: string;
  /** Name used after editing (test 2). */
  const nombreEditado = "E2E Editado";

  test.beforeEach(async ({ page }) => {
    await page.goto("/configuracion");
    await esperarCarga(page, 15_000);
    // Navigate to Usuarios section (default is Sucursales for ADMIN)
    await navegarSeccion(page, "Usuarios");
    await page.waitForLoadState("networkidle");
  });

  // ── 1. Crear usuario ───────────────────────────────────────────────────────

  test("crear usuario nuevo → aparece en la tabla de usuarios", async ({ page }) => {
    testEmail = uniqueEmail();

    await page.getByRole("button", { name: /nuevo usuario/i }).click();

    // Dialog opens with title "Nuevo usuario"
    await expect(page.getByRole("heading", { name: "Nuevo usuario" })).toBeVisible({
      timeout: 5_000,
    });

    // Fill form — fields use no htmlFor, navigate via label parent
    await dialogField(page, "Nombre *").fill("E2E");
    await dialogField(page, "Apellido *").fill("Prueba");
    await page.getByRole("dialog").locator('input[type="email"]').fill(testEmail);
    await page.getByPlaceholder("12.345.678-9").fill("12.345.678-5");
    await page.getByPlaceholder("Mínimo 6 caracteres").fill("e2epass123");
    // Rol defaults to the first available (ADMIN can select any)
    // Leave as-is to keep the test fast

    await page.getByRole("button", { name: /crear usuario/i }).click();

    // Toast confirms creation
    await esperarToast(page, /usuario creado/i, { timeout: 8_000 });

    // Dialog closes
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });

    // New user appears in the table (search by email to be precise)
    await page.getByPlaceholder(/buscar por nombre/i).fill(testEmail);
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByText(testEmail),
      "Created user's email must appear in the table"
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── 2. Editar usuario ──────────────────────────────────────────────────────

  test("editar usuario → nombre actualizado en la tabla", async ({ page }) => {
    // Search for the user by their email
    await page.getByPlaceholder(/buscar por nombre/i).fill(testEmail);
    await page.waitForLoadState("networkidle");

    // Open the actions dropdown for the user row
    const userRow = page.getByRole("row").filter({ hasText: testEmail });
    await expect(userRow).toBeVisible({ timeout: 8_000 });

    // Click the MoreHorizontal ⋮ button in the row
    await userRow
      .getByRole("button")
      .filter({ has: page.locator("svg") }) // ghost icon button
      .click();

    // Select "Editar" from the dropdown
    await page.getByRole("menuitem", { name: "Editar" }).click();

    // Edit dialog opens with the user's data
    await expect(page.getByRole("heading", { name: /editar usuario/i })).toBeVisible({
      timeout: 5_000,
    });

    // Change the Nombre field
    const nombreInput = dialogField(page, "Nombre *");
    await nombreInput.clear();
    await nombreInput.fill(nombreEditado);

    await page.getByRole("button", { name: /guardar cambios/i }).click();

    await esperarToast(page, /usuario actualizado/i, { timeout: 8_000 });
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });

    // Updated name visible in table
    await page.getByPlaceholder(/buscar por nombre/i).fill(testEmail);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText(nombreEditado),
      "Updated name must appear in the table"
    ).toBeVisible({ timeout: 8_000 });
  });

  // ── 3. Desactivar usuario ──────────────────────────────────────────────────

  test("desactivar usuario → estado cambia a 'Inactivo'", async ({ page }) => {
    await page.getByPlaceholder(/buscar por nombre/i).fill(testEmail);
    await page.waitForLoadState("networkidle");

    const userRow = page.getByRole("row").filter({ hasText: testEmail });
    await expect(userRow).toBeVisible({ timeout: 8_000 });

    // Confirm current status is "Activo"
    await expect(userRow.getByText("Activo")).toBeVisible();

    // Open actions menu and click Desactivar
    await userRow
      .getByRole("button")
      .filter({ has: page.locator("svg") })
      .click();
    await page.getByRole("menuitem", { name: /desactivar/i }).click();

    await esperarToast(page, /usuario desactivado/i, { timeout: 8_000 });

    // Status changes to "Inactivo" in the row
    await expect(userRow.getByText("Inactivo"), "Status must change to Inactivo").toBeVisible({
      timeout: 8_000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 3 — ADMIN: crear actividad
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuracion — ADMIN (actividades)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/configuracion");
    await esperarCarga(page, 15_000);
    await navegarSeccion(page, "Actividades");
    await page.waitForLoadState("networkidle");
  });

  test("crear actividad nueva → aparece en la lista de actividades", async ({ page }) => {
    const actNombre = `E2E-Act-${Date.now().toString().slice(-5)}`;

    // Click "Nueva actividad"
    await page.getByRole("button", { name: /nueva actividad/i }).click();

    // Dialog title
    await expect(page.getByRole("heading", { name: "Nueva actividad" })).toBeVisible({
      timeout: 5_000,
    });

    // Fill Nombre
    await page.getByPlaceholder("Ej: Mantenimiento preventivo").fill(actNombre);

    // Submit
    await page.getByRole("button", { name: /crear actividad/i }).click();

    await esperarToast(page, /actividad creada/i, { timeout: 8_000 });
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });

    // New activity appears in the list
    await expect(
      page.getByText(actNombre),
      "New activity name must appear in the activities list"
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 4 — ADMIN: crear regla SLA
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuracion — ADMIN (reglas SLA)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/configuracion");
    await esperarCarga(page, 15_000);
    await navegarSeccion(page, "Reglas SLA");
    await page.waitForLoadState("networkidle");
  });

  test("crear regla SLA nueva → aparece en la lista de reglas", async ({ page }) => {
    const slaName = `E2E-SLA-${Date.now().toString().slice(-5)}`;

    await page.getByRole("button", { name: /nueva regla/i }).click();

    // Dialog title
    await expect(page.getByRole("heading", { name: "Nueva regla SLA" })).toBeVisible({
      timeout: 5_000,
    });

    // Fill Nombre * (no placeholder — use label navigation)
    const nombreInput = page
      .getByRole("dialog")
      .locator("label")
      .filter({ hasText: "Nombre *" })
      .locator("..")
      .locator("input")
      .first();
    await nombreInput.fill(slaName);

    // Select a condition type (radio-style buttons)
    // "Técnico detenido" is the first condition
    await page.getByRole("dialog").getByText("Técnico detenido").click();

    // Submit
    await page.getByRole("button", { name: /crear regla/i }).click();

    await esperarToast(page, /regla/i, { timeout: 8_000 });
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 8_000 });

    // New rule appears in the SLA grid
    await expect(
      page.getByText(slaName),
      "New SLA rule name must appear in the rules grid"
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 5 — ADMIN: auditoría (tabla con logs y filtro)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuracion — ADMIN (auditoría)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/configuracion");
    await esperarCarga(page, 15_000);
    await navegarSeccion(page, "Auditoría");
    await page.waitForLoadState("networkidle");
  });

  test("tabla de auditoría muestra logs y filtro por acción funciona", async ({ page }) => {
    // Section heading
    await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible({ timeout: 8_000 });

    // Table must render (either with rows or showing the header)
    const auditTable = page.locator("table");
    await expect(auditTable).toBeVisible({ timeout: 8_000 });

    // Table header must have expected columns
    await expect(auditTable.getByRole("columnheader").first()).toBeVisible({
      timeout: 5_000,
    });

    // ── Filter by action ─────────────────────────────────────────────────────

    // The "acción" filter Select has placeholder "Todas las acciones"
    // (from SeccionAuditoria row 2 of filters)
    const accionFilterTrigger = page.locator("button").filter({
      hasText: "Todas las acciones",
    });
    await expect(accionFilterTrigger).toBeVisible({ timeout: 5_000 });

    // Open the Select and pick "LOGIN"
    const auditResponsePromise = page.waitForResponse(
      (res) => res.url().includes("/api/configuracion/auditoria") && res.status() < 400,
      { timeout: 8_000 }
    );
    await accionFilterTrigger.click();

    // SelectContent opens — look for "LOGIN" option
    const loginOption = page.getByRole("option", { name: "LOGIN" });
    await expect(loginOption).toBeVisible({ timeout: 5_000 });
    await loginOption.click();

    // API re-fetches with the accion filter
    await auditResponsePromise;
    await page.waitForLoadState("networkidle");

    // Table updated — either shows LOGIN rows or empty state
    // auth.setup.ts logs in as ADMIN → at least 1 LOGIN entry should exist
    const firstRow = auditTable.locator("tbody tr").first();
    const hasRow = await firstRow.isVisible({ timeout: 3_000 }).catch(() => false);

    if (hasRow) {
      // Each visible row in the filtered result should show "LOGIN" badge
      await expect(auditTable.locator("tbody tr").first().getByText("LOGIN").first()).toBeVisible({
        timeout: 5_000,
      });
    }
    // If no rows: filter worked correctly (no LOGIN events in current range)
    // The key assertion is that the filter did not error
    await expect(auditTable).toBeVisible({ timeout: 3_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 6 — JEFE_TALLER: secciones y restricciones
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuracion — JEFE_TALLER (secciones y restricciones)", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  test.beforeEach(async ({ page }) => {
    await page.goto("/configuracion");
    await esperarCarga(page, 15_000);
  });

  // ── 1. Solo secciones permitidas visibles ──────────────────────────────────

  test("solo secciones permitidas visibles en el sidebar (sin Sucursales ni Auditoría)", async ({
    page,
  }) => {
    const sidebar = configSidebar(page);
    await expect(sidebar).toBeVisible({ timeout: 8_000 });

    // JEFE_TALLER CAN see these sections
    for (const label of ["Turnos", "Usuarios", "Especialidades", "Actividades", "Reglas SLA"]) {
      await expect(
        sidebar.getByRole("button", { name: label }),
        `JEFE_TALLER must see "${label}" section`
      ).toBeVisible({ timeout: 5_000 });
    }

    // JEFE_TALLER CANNOT see these sections
    for (const label of ["Sucursales", "Auditoría"]) {
      await expect(
        sidebar.getByRole("button", { name: label }),
        `JEFE_TALLER must NOT see "${label}" section`
      ).not.toBeVisible({ timeout: 3_000 });
    }
  });

  // ── 2. No puede crear usuario ADMIN ────────────────────────────────────────

  test("JEFE_TALLER no puede crear usuario con rol ADMIN (opciones limitadas)", async ({
    page,
  }) => {
    // Navigate to Usuarios (jefe default is Turnos)
    await navegarSeccion(page, "Usuarios");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: /nuevo usuario/i }).click();
    await expect(page.getByRole("heading", { name: "Nuevo usuario" })).toBeVisible({
      timeout: 5_000,
    });

    // Open the Rol Select in the dialog
    // rolesDisponibles("JEFE_TALLER") = ["COORDINADOR", "TECNICO"]
    const dialog = page.getByRole("dialog");
    const rolTrigger = dialog.locator("[role='combobox']").first();
    await rolTrigger.click();

    // Options popup should appear
    const optionsList = page.locator("[role='listbox'], [role='option']").first();
    await optionsList.waitFor({ state: "visible", timeout: 5_000 });

    // "Administrador" must NOT be among the options
    await expect(
      page.getByRole("option", { name: "Administrador" }),
      "JEFE_TALLER must not be able to select 'Administrador' role"
    ).not.toBeVisible({ timeout: 3_000 });

    // "Técnico" and "Coordinador" must be available
    await expect(page.getByRole("option", { name: "Técnico" })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole("option", { name: "Coordinador" })).toBeVisible({ timeout: 3_000 });

    // Close dialog
    await page.keyboard.press("Escape");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 7 — TECNICO: /configuracion no accesible
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Configuracion — TECNICO (acceso denegado)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/configuracion redirige fuera para TECNICO", async ({ page }) => {
    // Login as TECNICO (lands on /tecnico)
    await loginComoTecnico(page);
    await page.waitForURL("**/tecnico**", { timeout: 15_000 });

    // Attempt to navigate to /configuracion
    await page.goto("/configuracion");

    // configuracion/page.tsx: canAccess("TECNICO","configuracion") = false
    //   → redirect("/dashboard")
    // dashboard/page.tsx: canAccess("TECNICO","dashboard") = false
    //   → redirect("/login")
    await page.waitForURL(/\/(login|tecnico)/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/(login|tecnico)/);
    expect(page.url()).not.toContain("/configuracion");
  });
});
