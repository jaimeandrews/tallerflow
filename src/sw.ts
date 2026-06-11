/// <reference lib="webworker" />
/**
 * Service Worker — TallerFlow PWA
 *
 * ── PRECACHE ──────────────────────────────────────────────────────────────────
 * Managed by @serwist/next via `__SW_MANIFEST` (build-time manifest).
 * Only the app shell routes + their JS/CSS bundles are precached:
 *   /marcaje    → kiosco PIN screen (primary offline route)
 *   /tecnico    → tablet technician view
 *   CSS + JS bundles ≤ 500 KB (large chunks excluded in next.config.ts)
 *
 * ── RUNTIME CACHING (first-match wins, evaluated in order) ───────────────────
 *
 *  1. Self-hosted fonts (next/font → /_next/static/media/*.woff2)
 *       CacheFirst · 30 days · maxEntries 50
 *
 *  2. App images (icons, manifest assets)
 *       CacheFirst · 7 days · maxEntries 50
 *
 *  3. API: semi-static config data (actividades, sucursales, especialidades)
 *       StaleWhileRevalidate · 1 hour · maxEntries 50
 *       Serve stale instantly → background fetch updates the cache silently.
 *
 *  4. API: kiosco turno — needed offline to stamp marcajes with the shift
 *       NetworkFirst · timeout 4 s · 4h fallback · maxEntries 50
 *
 *  5. API: kiosco-critical (mis-asignaciones, historial-hoy)
 *       NetworkFirst · timeout 5 s · 8h / 30min TTL · maxEntries 50
 *
 *  6. API: always-live — never cache (real-time state)
 *       NetworkOnly: /api/marcaje/activo, /api/dashboard/*, /api/centro-control/*
 *
 *  7. API: reportes — NetworkOnly in SW (browser Cache-Control: 60s handles it)
 *       NetworkOnly
 *
 *  8. API: all mutations (POST, PUT, PATCH, DELETE)
 *       NetworkOnly — the offline queue (src/lib/offline/) buffers marcajes.
 *
 *  9. defaultCache — Next.js bundles, pages, Next.js image optimization
 *       Handled by @serwist/next's built-in strategies.
 *
 * ── SECURITY ─────────────────────────────────────────────────────────────────
 * Auth tokens live in HttpOnly cookies — the SW never reads or writes them.
 * Cached API responses contain only the data the user already received.
 * Cache names are namespaced to this app; no cross-origin data bleeds in.
 */

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  ExpirationPlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

// ── Cache-size constants ──────────────────────────────────────────────────────
// Consistent maxEntries prevents unbounded cache growth.
const MAX = 50;

// ── TTL helpers (seconds) ─────────────────────────────────────────────────────
const MINS = (n: number) => n * 60;
const HRS = (n: number) => n * 60 * 60;
const DAYS = (n: number) => n * 60 * 60 * 24;

// ── Service Worker instance ───────────────────────────────────────────────────

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true, // activate new SW immediately on update
  clientsClaim: true, // take control of all open tabs right away
  navigationPreload: true, // allow the browser to fetch the page while SW boots

  runtimeCaching: [
    // ── 1. FONTS ──────────────────────────────────────────────────────────────
    //
    // next/font self-hosts fonts in /_next/static/media/ as version-hashed
    // .woff2 files. CacheFirst is safe here because the hash changes on rebuild.
    {
      matcher: ({ url }) =>
        url.pathname.startsWith("/_next/static/media/") &&
        /\.(woff2?|ttf|otf|eot)$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "fonts",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: DAYS(30), maxEntries: MAX })],
      }),
    },

    // ── 2. IMAGES ─────────────────────────────────────────────────────────────
    //
    // PWA icons (/icons/*.png) + any other same-origin images.
    // 7-day TTL balances freshness against cache growth.
    {
      matcher: ({ url }) =>
        url.origin === self.location.origin && /\.(png|jpe?g|webp|gif|svg|ico)$/.test(url.pathname),
      handler: new CacheFirst({
        cacheName: "images",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: DAYS(7), maxEntries: MAX })],
      }),
    },

    // ── 3. SEMI-STATIC API DATA ───────────────────────────────────────────────
    //
    // StaleWhileRevalidate: serve the cached version instantly (no spinner)
    // while fetching a fresh copy silently in the background.
    // TTL: 1 hour — longer than the in-process server cache (5 min) so that
    // offline kioscos keep working through a full work shift.

    // GET /api/actividades — kiosco activity list
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname === "/api/actividades",
      handler: new StaleWhileRevalidate({
        cacheName: "api-actividades",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: HRS(1), maxEntries: MAX })],
      }),
    },

    // GET /api/configuracion/sucursales — branch list used in config UI
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname === "/api/configuracion/sucursales",
      handler: new StaleWhileRevalidate({
        cacheName: "api-sucursales",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: HRS(1), maxEntries: MAX })],
      }),
    },

    // GET /api/configuracion/especialidades — specialty list for user dialogs
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname === "/api/configuracion/especialidades",
      handler: new StaleWhileRevalidate({
        cacheName: "api-especialidades",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: HRS(1), maxEntries: MAX })],
      }),
    },

    // ── 4. TURNO ACTUAL ───────────────────────────────────────────────────────
    //
    // The kiosco stamps each marcaje with the current turno.
    // Offline fallback prevents missing this critical value — shifts rarely
    // change mid-day. Network timeout 4 s keeps the kiosco responsive.
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname === "/api/turnos/actual",
      handler: new NetworkFirst({
        cacheName: "api-turno-actual",
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxAgeSeconds: HRS(4), maxEntries: MAX })],
      }),
    },

    // ── 5. KIOSCO-CRITICAL DATA ───────────────────────────────────────────────
    //
    // Must be as fresh as possible; cached copies are fallback-only.

    // OF assignments for the day (used by kiosco to select the target OF)
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname === "/api/ordenes/mis-asignaciones",
      handler: new NetworkFirst({
        cacheName: "api-mis-asignaciones",
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxAgeSeconds: HRS(8), maxEntries: MAX })],
      }),
    },

    // Today's marcaje history — displayed on the kiosco timeline
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname === "/api/marcaje/historial-hoy",
      handler: new NetworkFirst({
        cacheName: "api-historial-hoy",
        networkTimeoutSeconds: 5,
        plugins: [new ExpirationPlugin({ maxAgeSeconds: MINS(30), maxEntries: MAX })],
      }),
    },

    // ── 6. ALWAYS-LIVE — NetworkOnly ─────────────────────────────────────────
    //
    // These endpoints reflect current real-time state; a stale cached value
    // would be worse than showing an offline error.

    // Active marcaje: safety-critical — must always reflect DB truth
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname === "/api/marcaje/activo",
      handler: new NetworkOnly(),
    },

    // Dashboard KPIs and live feeds
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname.startsWith("/api/dashboard/"),
      handler: new NetworkOnly(),
    },

    // Centro de control (real-time Socket.io context)
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname.startsWith("/api/centro-control/"),
      handler: new NetworkOnly(),
    },

    // ── 7. REPORTES — NetworkOnly ────────────────────────────────────────────
    //
    // The browser-level Cache-Control: private, max-age=60 header handles
    // short-term caching. The SW must not interfere with per-user responses.
    {
      matcher: ({ url, request }) =>
        request.method === "GET" && url.pathname.startsWith("/api/reportes/"),
      handler: new NetworkOnly(),
    },

    // ── 8. MUTATIONS — NetworkOnly ────────────────────────────────────────────
    //
    // POST/PUT/PATCH/DELETE are never cached.
    // The offline queue in src/lib/offline/ handles marcaje mutation buffering
    // when connectivity is lost (IndexedDB → sync on reconnect).
    {
      matcher: ({ request }) => ["POST", "PUT", "PATCH", "DELETE"].includes(request.method),
      handler: new NetworkOnly(),
    },

    // ── 9. DEFAULT (Next.js bundles, pages, image optimization) ──────────────
    //
    // @serwist/next's defaultCache applies CacheFirst to /_next/static/**
    // (version-hashed JS/CSS), NetworkFirst to pages, and CacheFirst to
    // /_next/image. We defer to it for everything not matched above.
    ...defaultCache,
  ],
});

serwist.addEventListeners();
