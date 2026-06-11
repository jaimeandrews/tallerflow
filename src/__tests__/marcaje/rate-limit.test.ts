import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkRateLimit,
  recordFailureAndMaybeBlock,
  clearFailures,
  __resetRateLimit,
} from "@/lib/middleware/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimit();
    vi.useRealTimers();
  });

  it("permite las primeras N peticiones dentro de la ventana", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k", 5, 60_000).allowed).toBe(true);
    }
  });

  it("bloquea la petición N+1 dentro de la ventana", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 60_000);
    const r = checkRateLimit("k", 5, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
  });

  it("reinicia el contador después de pasar la ventana", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0);
    for (let i = 0; i < 5; i++) checkRateLimit("k", 5, 1000);
    expect(checkRateLimit("k", 5, 1000).allowed).toBe(false);
    vi.setSystemTime(t0 + 2000);
    expect(checkRateLimit("k", 5, 1000).allowed).toBe(true);
    vi.useRealTimers();
  });
});

describe("recordFailureAndMaybeBlock", () => {
  beforeEach(() => __resetRateLimit());

  it("no bloquea con menos de 5 fallos en 5 minutos", () => {
    for (let i = 0; i < 4; i++) {
      expect(recordFailureAndMaybeBlock("ip-1")).toBeNull();
    }
  });

  it("bloquea 15 min después del 5° fallo en 5 minutos", () => {
    for (let i = 0; i < 4; i++) recordFailureAndMaybeBlock("ip-1");
    const block = recordFailureAndMaybeBlock("ip-1");
    expect(block).not.toBeNull();
    expect(block!.reason).toMatch(/15min/);
  });

  it("bloquea 1 hora después del 10° fallo dentro de 1 hora", () => {
    vi.useFakeTimers();
    const t0 = Date.now();
    vi.setSystemTime(t0);

    // First wave: 5 failures → 15min block applied
    for (let i = 0; i < 5; i++) recordFailureAndMaybeBlock("ip-2");

    // After the first block resolves, attempts continue. Simulate 16 min passing.
    vi.setSystemTime(t0 + 16 * 60 * 1000);

    // 5 more failures (total of 10 within last hour) → 1h block
    let lastBlock = null;
    for (let i = 0; i < 5; i++) {
      lastBlock = recordFailureAndMaybeBlock("ip-2");
    }
    expect(lastBlock).not.toBeNull();
    expect(lastBlock!.reason).toMatch(/1h/);
    vi.useRealTimers();
  });

  it("checkRateLimit respeta el bloqueo aplicado por recordFailureAndMaybeBlock", () => {
    for (let i = 0; i < 5; i++) recordFailureAndMaybeBlock("ip-3");
    const r = checkRateLimit("ip-3", 100, 60_000);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/15min/);
  });

  it("clearFailures elimina el bloqueo y el historial", () => {
    for (let i = 0; i < 5; i++) recordFailureAndMaybeBlock("ip-4");
    expect(checkRateLimit("ip-4", 100, 60_000).allowed).toBe(false);

    clearFailures("ip-4");
    expect(checkRateLimit("ip-4", 100, 60_000).allowed).toBe(true);
  });
});
