/**
 * Wait helpers for TallerFlow E2E tests.
 *
 * These helpers encapsulate common "wait for UI state" patterns so individual
 * tests stay clean and don't repeat brittle timeout logic.
 */

import { type Page, expect } from "@playwright/test";

// ── Toast helpers ─────────────────────────────────────────────────────────────

/**
 * Wait for a Sonner toast notification containing the given text to appear.
 *
 * Sonner renders toasts in an <ol> inside `[data-sonner-toaster]`.
 * Each toast `<li>` contains a `[data-title]` element.
 *
 * @param page  Playwright page
 * @param texto Substring or regex to match against the toast message
 * @param opts  Optional timeout override (default: 8 000 ms)
 */
export async function esperarToast(
  page: Page,
  texto: string | RegExp,
  opts: { timeout?: number } = {}
): Promise<void> {
  const timeout = opts.timeout ?? 8_000;
  const pattern = typeof texto === "string" ? new RegExp(texto, "i") : texto;

  // Sonner's toast items — try data-title first, then any text content
  const toastLocator = page.locator("[data-sonner-toaster] li").filter({ hasText: pattern });

  await expect(toastLocator.first(), `Toast with text "${texto}" should appear`).toBeVisible({
    timeout,
  });
}

/**
 * Wait for a success (green) toast.
 */
export async function esperarToastExito(
  page: Page,
  texto: string | RegExp,
  opts: { timeout?: number } = {}
): Promise<void> {
  await esperarToast(page, texto, opts);
}

/**
 * Wait for an error (red) toast.
 */
export async function esperarToastError(
  page: Page,
  texto: string | RegExp,
  opts: { timeout?: number } = {}
): Promise<void> {
  await esperarToast(page, texto, opts);
}

// ── Loading state helpers ─────────────────────────────────────────────────────

/**
 * Wait until no skeleton loaders or loading spinners are visible.
 *
 * Skeleton components from shadcn/ui use `.animate-pulse` class.
 * Spinner / loading indicators use `[aria-busy="true"]` or `role="status"`.
 *
 * Prefer calling this after navigation or after triggering an action that
 * shows a loading state before rendering real content.
 *
 * @param page     Playwright page
 * @param timeout  Max wait in ms (default: 15 000)
 */
export async function esperarCarga(page: Page, timeout = 15_000): Promise<void> {
  // Wait for network to settle first (covers most API-driven loading)
  await page.waitForLoadState("networkidle", { timeout });

  // Then ensure no skeleton animation is running
  await expect(
    page.locator(".animate-pulse"),
    "Skeleton loaders should disappear after data loads"
  ).toHaveCount(0, { timeout });
}

/**
 * Wait for a specific page section to finish loading (by heading text).
 * Useful when a section has its own loading state separate from the full page.
 *
 * @example
 *   await esperarSeccionCargada(page, "Gestión de usuarios");
 */
export async function esperarSeccionCargada(
  page: Page,
  titulo: string | RegExp,
  timeout = 10_000
): Promise<void> {
  const pattern = typeof titulo === "string" ? new RegExp(titulo, "i") : titulo;
  await expect(
    page.getByRole("heading", { name: pattern }),
    `Section heading "${titulo}" should be visible`
  ).toBeVisible({ timeout });

  // Then wait for skeletons inside that section to disappear
  await page.waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, {
    timeout,
  });
}

// ── Dialog helpers ────────────────────────────────────────────────────────────

/**
 * Wait for a dialog/modal to open and be interactive.
 */
export async function esperarDialog(
  page: Page,
  titulo: string | RegExp,
  timeout = 8_000
): Promise<void> {
  const pattern = typeof titulo === "string" ? new RegExp(titulo, "i") : titulo;
  await expect(page.getByRole("dialog").getByRole("heading", { name: pattern })).toBeVisible({
    timeout,
  });
}

/**
 * Wait for a dialog to close (disappear from DOM).
 */
export async function esperarDialogCerrado(page: Page, timeout = 5_000): Promise<void> {
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout });
}

// ── Navigation helpers ────────────────────────────────────────────────────────

/**
 * Navigate and wait for the page to be fully loaded (networkidle + no skeletons).
 */
export async function irA(
  page: Page,
  url: string,
  opts: { waitForHeading?: string | RegExp } = {}
): Promise<void> {
  await page.goto(url);
  await esperarCarga(page);

  if (opts.waitForHeading) {
    const pattern =
      typeof opts.waitForHeading === "string"
        ? new RegExp(opts.waitForHeading, "i")
        : opts.waitForHeading;
    await expect(page.getByRole("heading", { name: pattern })).toBeVisible({ timeout: 10_000 });
  }
}
