"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Detecta inactividad en el kiosco y ejecuta `onLogout` tras `timeoutMs`.
 *
 * Flujo con aviso:
 *   ├─ 0 … (timeoutMs - warningMs) → idle silencioso
 *   ├─ (timeoutMs - warningMs) … timeoutMs → countdown visible (30 → 1)
 *   └─ timeoutMs → onLogout()
 *
 * Cualquier evento de usuario (touch, mouse, teclado, scroll) reinicia
 * el ciclo completo y cierra el countdown si estaba abierto.
 *
 * @returns countdown  número de segundos restantes (null = sin aviso visible)
 */
export function useInactividadLogout(
  onLogout: () => void,
  timeoutMs = 5 * 60 * 1000, // total idle time before logout (default 5 min)
  warningMs = 30 * 1000 // how early to show the warning  (default 30 s)
): { countdown: number | null } {
  const [countdown, setCountdown] = useState<number | null>(null);

  // Stable refs so closures never go stale
  const callbackRef = useRef(onLogout);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickValue = useRef<number | null>(null); // current countdown without state lag

  useEffect(() => {
    callbackRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    const warningSeconds = Math.max(1, Math.floor(warningMs / 1000));

    // ── Clear everything ────────────────────────────────────────────────────
    const clearAll = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (tickInterval.current) clearInterval(tickInterval.current);
      idleTimer.current = null;
      tickInterval.current = null;
    };

    // ── Start the visible countdown ─────────────────────────────────────────
    const startCountdown = () => {
      tickValue.current = warningSeconds;
      setCountdown(warningSeconds);

      tickInterval.current = setInterval(() => {
        const next = (tickValue.current ?? 0) - 1;
        tickValue.current = next;
        setCountdown(next);

        if (next <= 0) {
          clearAll();
          callbackRef.current();
        }
      }, 1_000);
    };

    // ── Reset on user activity ──────────────────────────────────────────────
    const reset = () => {
      clearAll();
      tickValue.current = null;
      setCountdown(null);

      // Restart idle phase (fires warning after timeoutMs - warningMs)
      idleTimer.current = setTimeout(startCountdown, timeoutMs - warningMs);
    };

    const EVENTS = [
      "touchstart",
      "touchmove",
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
    ] as const;

    EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset(); // kick off the first idle timer

    return () => {
      clearAll();
      EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs, warningMs]);

  return { countdown };
}
