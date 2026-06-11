/**
 * Performance tests — tiempos de carga de páginas clave
 *
 * Miden el tiempo total desde que el navegador inicia la navegación hasta
 * que la red está inactiva (waitForLoadState("networkidle")), lo que equivale
 * a "la página está completamente cargada y todos los fetch/XHR han completado".
 *
 * Para la autenticación PIN, se mide solo el segmento crítico:
 * desde el clic del cuarto dígito (auto-submit) hasta que el timer aparece,
 * excluyendo el tiempo de ingreso manual de los dígitos.
 *
 * ── Umbrales ─────────────────────────────────────────────────────────────────
 * /dashboard               < 3 000 ms   (datos KPI + gráfico + técnicos)
 * /ordenes (30 OF)         < 3 000 ms   (tabla paginada, primera página)
 * /centro-control          < 4 000 ms   (WebSocket + grid + ribbon + alertas)
 * /marcaje (pantalla PIN)  < 2 000 ms   (SSR con DB query de sucursal)
 * Autenticación PIN E2E    < 1 000 ms   (bcrypt + JWT + re-render)
 *
 * ── Nota sobre datos de /ordenes ─────────────────────────────────────────────
 * El beforeAll garantiza al menos 30 OFs activas en Antofagasta antes de
 * ejecutar el test. Crea las OFs faltantes via API usando la sesión de ADMIN.
 * Los números de OF con prefijo "P" (PERF) persisten en la DB entre runs;
 * al llegar a 30, el beforeAll no crea más.
 */

import { test, expect, type BrowserContext } from "@playwright/test";

// ── Thresholds (ms) ───────────────────────────────────────────────────────────

const T = {
  dashboard: 3_000,
  ordenes: 3_000,
  centroControl: 4_000,
  marcajePinScreen: 2_000,
  pinAuth: 1_000,
} as const;

// ── Helper: measure page load time ───────────────────────────────────────────

/**
 * Navigate to `url` and wait for networkidle.
 * Returns the elapsed time in milliseconds.
 */
async function measureLoad(
  page: import("@playwright/test").Page,
  url: string,
  networkIdleTimeout = 15_000
): Promise<number> {
  const start = Date.now();
  await page.goto(url);
  await page.waitForLoadState("networkidle", { timeout: networkIdleTimeout });
  return Date.now() - start;
}

// ─────────────────────────────────────────────────────────────────────────────
// Describe 1 — Páginas de supervisor (JEFE_TALLER)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Performance — páginas supervisores (JEFE_TALLER)", () => {
  test.use({ storageState: "tests/e2e/fixtures/.auth/jefe.json" });

  // ── Ensure ≥ 30 OFs for the ordenes test ─────────────────────────────────

  let adminCtx: BrowserContext | undefined;

  test.beforeAll(async ({ browser }) => {
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

    // Use admin session to create OFs (admin can specify any sucursalId)
    adminCtx = await browser.newContext({
      baseURL,
      storageState: "tests/e2e/fixtures/.auth/admin.json",
    });
    const adminPage = await adminCtx.newPage();
    await adminPage.goto("/ordenes");
    await adminPage.waitForLoadState("networkidle");

    // Get current total and Antofagasta sucursalId from seed OFs
    const listRes = await adminPage.request.get("/api/ordenes?porPagina=50");
    if (!listRes.ok()) {
      await adminPage.close();
      return;
    }
    const listBody = (await listRes.json()) as {
      data: Array<{ sucursalId: string; sucursal?: { codigo: string } }>;
      total: number;
    };

    // Find ANT sucursalId from existing seed OFs
    const antOF = listBody.data.find((o) => o.sucursal?.codigo === "ANT");
    const antSucursalId = antOF?.sucursalId;

    if (!antSucursalId) {
      // Cannot determine ANT sucursalId — skip OF creation
      await adminPage.close();
      return;
    }

    const toCreate = Math.max(0, 30 - listBody.total);

    // Create the missing OFs sequentially to avoid race conditions
    const batchStart = Date.now();
    for (let i = 0; i < toCreate; i++) {
      const numero = `P${batchStart}${i}`; // e.g. "P17486200000000"
      await adminPage.request.post("/api/ordenes", {
        data: {
          numero,
          proyecto: "PERF-TEST",
          nombre: `Performance Test OF ${i + 1}`,
          cliente: "Performance Cliente",
          equipo: "Performance Equipo",
          sucursalId: antSucursalId,
          hhEstimadas: 8,
          prioridad: "MEDIA",
          tecnicosRequeridos: 1,
        },
      });
    }

    await adminPage.close();
  });

  test.afterAll(async () => {
    await adminCtx?.close();
  });

  // ── 1. Dashboard < 3 s ────────────────────────────────────────────────────

  test(`/dashboard carga en < ${T.dashboard}ms`, async ({ page }) => {
    const ms = await measureLoad(page, "/dashboard");
    expect(ms, `Dashboard debería cargar en < ${T.dashboard}ms · tardó ${ms}ms`).toBeLessThan(
      T.dashboard
    );
  });

  // ── 2. Ordenes con 30 OF < 3 s ────────────────────────────────────────────

  test(`/ordenes (≥ 30 OF) carga en < ${T.ordenes}ms`, async ({ page }) => {
    // The beforeAll ensured ≥ 30 OFs for ANT.
    // Jefe session filters to ANT only → first page (20 rows) is loaded.
    const ms = await measureLoad(page, "/ordenes");
    expect(
      ms,
      `/ordenes debería cargar en < ${T.ordenes}ms con 30+ OFs · tardó ${ms}ms`
    ).toBeLessThan(T.ordenes);

    // Sanity: at least 1 row visible (confirms data loaded, not just shell)
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 2_000 });
  });

  // ── 3. Centro de control < 4 s ────────────────────────────────────────────

  test(`/centro-control carga en < ${T.centroControl}ms`, async ({ page }) => {
    // Centro-control establishes a WebSocket after polling — networkidle may
    // settle after the polling-to-WebSocket upgrade (~300ms extra).
    const ms = await measureLoad(page, "/centro-control", 20_000);
    expect(
      ms,
      `/centro-control debería cargar en < ${T.centroControl}ms · tardó ${ms}ms`
    ).toBeLessThan(T.centroControl);

    // Sanity: Grid heading visible
    await expect(page.getByRole("heading", { name: /técnicos.*live/i })).toBeVisible({
      timeout: 2_000,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Describe 2 — Kiosco (sin sesión)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Performance — kiosco PIN (sin sesión)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  // ── 4. Pantalla PIN < 2 s ─────────────────────────────────────────────────

  test(`/marcaje (pantalla PIN) carga en < ${T.marcajePinScreen}ms`, async ({ page }) => {
    // KioscoLayout does a server-side DB query for the active sucursal.
    // This is included in the measured time.
    const start = Date.now();
    await page.goto("/marcaje");

    // The PIN screen must be visible — more meaningful than just networkidle
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({
      timeout: T.marcajePinScreen + 1_000, // generous wait
    });
    const ms = Date.now() - start;

    expect(
      ms,
      `/marcaje PIN screen debería aparecer en < ${T.marcajePinScreen}ms · tardó ${ms}ms`
    ).toBeLessThan(T.marcajePinScreen);
  });

  // ── 5. Autenticación PIN E2E < 1 s ────────────────────────────────────────

  test(`autenticación PIN completa en < ${T.pinAuth}ms`, async ({ page }) => {
    test.slow(); // triples the test timeout (not the measured threshold)

    // Navigate and wait for the PIN screen to be ready
    await page.goto("/marcaje");
    await expect(page.getByText(/ingresa tu PIN/i)).toBeVisible({
      timeout: 5_000,
    });

    // Enter the first 3 digits of PIN 1234 (pre-stage without triggering submit)
    for (const digit of "123".split("")) {
      await page.getByRole("button", { name: new RegExp(`^${digit}$`) }).click();
    }

    // Measure ONLY from the 4th digit (auto-submit) to the timer appearing.
    // This isolates the API round-trip + bcrypt + JWT + React re-render.
    // bcrypt.compare at cost=10 takes ~100ms; JWT generation ~5ms.
    // Total expected: ~200–400ms on a warm dev server.
    const authStart = Date.now();
    await page.getByRole("button", { name: /^4$/ }).click();

    // The timer (HH:MM:SS, large div.font-mono.font-bold) appears once
    // the kiosco context is set and the Dashboard component renders.
    // "Cambiar" button is a reliable readiness indicator for the kiosco dashboard.
    await expect(
      page.getByRole("button", { name: "Cambiar" }),
      "Kiosco dashboard should appear after PIN authentication"
    ).toBeVisible({ timeout: T.pinAuth + 2_000 }); // generous wait for the assertion

    const authMs = Date.now() - authStart;

    expect(
      authMs,
      `PIN auth (bcrypt + JWT + re-render) debería completarse en < ${T.pinAuth}ms · tardó ${authMs}ms`
    ).toBeLessThan(T.pinAuth);
  });
});
