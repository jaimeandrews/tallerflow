/**
 * In-memory TTL cache for semi-static data.
 *
 * Purpose: avoid repeated DB hits for data that changes rarely
 * (actividades, especialidades, turnos) but is read on every request.
 *
 * Design:
 *  • Simple Map<key, {value, expiresAt}> — no external dependencies.
 *  • Single shared instance (module-level singleton) across requests in
 *    the same Node.js process. In serverless each instance is ephemeral,
 *    so the cache acts as a request-burst absorber rather than a
 *    long-lived store.
 *  • Entries expire lazily on next read (no background sweeper).
 *  • Thread-safe for single-threaded Node.js (no concurrent mutations).
 *
 * What to cache (TTL 5 min):
 *  ✓ actividades list per sucursal  → key: "actividades:{sucursalId|global}"
 *  ✓ especialidades list            → key: "especialidades"
 *  ✓ turnos list per sucursal       → key: "turnos:{sucursalId}"
 *
 * What NOT to cache (real-time or user-specific):
 *  ✗ marcajes, asignaciones, alertas, ordenes — always fresh from DB
 *  ✗ dashboard KPIs — depend on live marcaje data
 *
 * Invalidation: call invalidate(key) or invalidatePrefix(prefix) when
 * the underlying data changes (POST / PUT / PATCH / DELETE handlers).
 */

const DEFAULT_TTL_MS = 5 * 60 * 1_000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // Date.now() + ttl
}

class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  /** Read a cached value. Returns undefined if missing or expired. */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  /** Store a value with an optional TTL (defaults to 5 min). */
  set<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /**
   * Get-or-compute pattern: returns the cached value if fresh, otherwise
   * calls `fn()`, caches the result, and returns it.
   *
   * @example
   *   const data = await cache.getOrSet("actividades:ANT", () => prisma.actividad.findMany(...));
   */
  async getOrSet<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await fn();
    this.set(key, value, ttlMs);
    return value;
  }

  /** Remove a single cache entry. */
  invalidate(key: string): void {
    this.store.delete(key);
  }

  /**
   * Remove all entries whose key starts with `prefix`.
   * Use for group invalidation, e.g. invalidatePrefix("actividades:")
   * to clear all sucursal variants at once.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  /** Remove all entries (useful in tests or hot-reload scenarios). */
  clear(): void {
    this.store.clear();
  }

  /** Number of live (non-expired) entries — for observability. */
  get size(): number {
    let count = 0;
    const now = Date.now();
    for (const entry of this.store.values()) {
      if (now <= entry.expiresAt) count++;
    }
    return count;
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────

/** Shared in-memory TTL cache. Import this wherever caching is needed. */
export const cache = new TtlCache();

// ── Cache key helpers ─────────────────────────────────────────────────────────

export const CACHE_KEYS = {
  /** Active actividades visible to a given sucursal (includes globals). */
  actividades: (sucursalId: string) => `actividades:${sucursalId}`,

  /** All active especialidades (global, no per-sucursal variant). */
  especialidades: "especialidades",

  /** Active turnos for a given sucursal. */
  turnos: (sucursalId: string) => `turnos:${sucursalId}`,
} as const;
