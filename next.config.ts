import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import BundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = BundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const isDev = process.env.NODE_ENV === "development";

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true, // precache navigation (HTML shell) on first load
  reloadOnOnline: true, // reload tabs when connectivity is restored
  disable: isDev, // disable SW in dev to avoid stale assets

  // ── Minimal-shell precache ──────────────────────────────────────────────
  // Exclude chunks > 500 KB from precache — they are fetched on demand and
  // then served via runtimeCaching (CacheFirst via defaultCache).
  maximumFileSizeToCacheInBytes: 500 * 1024, // 500 KB

  // Exclude generated files that are not part of the offline shell:
  //   • Source maps (.map) — not needed at runtime
  //   • Webpack hot-update chunks — dev-only, not in production builds
  //   • build-manifest.json / app-build-manifest.json — internal Next.js
  //     orchestration files; their referenced assets are already in the manifest
  exclude: [/\.map$/, /webpack\.hot-update\.(json|js)$/, /^.*build-manifest\.json$/],
});

const isProd = process.env.NODE_ENV === "production";

// CSP: unsafe-eval is required by Next.js RSC bundler in dev.
// In production Next.js uses nonces or hashes — keep unsafe-inline only for styles
// (Tailwind inlines critical CSS). A nonce-based CSP would require middleware rewrite.
const cspValue =
  "default-src 'self'; " +
  (isProd
    ? "script-src 'self' 'unsafe-inline'; "
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline'; ") +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' ws: wss:; " +
  "worker-src 'self' blob:; " +
  "manifest-src 'self'; " +
  "frame-ancestors 'none';";

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspValue },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "0" }, // Deprecated — CSP supersedes it; "0" disables the buggy IE XSS filter
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // A05: HSTS — tells browsers to always use HTTPS. max-age=1 year.
  // Only sent in production so local HTTP dev isn't broken.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      // ── Security headers (all routes) ────────────────────────────────────
      {
        source: "/:path*",
        headers: securityHeaders,
      },

      // ── API Cache-Control ─────────────────────────────────────────────────
      // Dashboard endpoints: always fresh (live data — timers, active marcajes)
      {
        source: "/api/dashboard/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-cache" }],
      },
      // Centro-control endpoints: always fresh (real-time Socket.io context)
      {
        source: "/api/centro-control/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-cache" }],
      },
      // Marcaje endpoints: always live (active marcaje state is safety-critical)
      {
        source: "/api/marcaje/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-cache" }],
      },
      // Reportes: short private cache — reports don't change every second
      // but must not be shared (row-level security per sucursal)
      {
        source: "/api/reportes/:path*",
        headers: [{ key: "Cache-Control", value: "private, max-age=60" }],
      },
    ];
  },
};

// Pipeline: BundleAnalyzer → Serwist → Next.js
// BundleAnalyzer is a no-op unless ANALYZE=true
export default withBundleAnalyzer(withSerwist(nextConfig));
