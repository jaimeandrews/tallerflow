"use client";

/**
 * CountdownOverlay — aviso de cierre de sesión por inactividad en el kiosco.
 *
 * Aparece cuando el hook useInactividadLogout entra en su fase de aviso
 * (últimos 30 s del timeout). Muestra un anillo de progreso SVG animado y
 * un contador regresivo.
 *
 * El usuario puede descartar el aviso tocando o haciendo clic en cualquier
 * lugar: el listener de `mousedown`/`touchstart` del hook se dispara y
 * reinicia el ciclo, lo que pone `countdown` en null y oculta el overlay.
 * El botón explícito también funciona por ese motivo (sin necesitar onClick).
 */

import { cn } from "@/lib/utils";

interface CountdownOverlayProps {
  countdown: number; // 30 → 1
  totalSeconds?: number; // denominador del arco (default 30)
}

export function CountdownOverlay({ countdown, totalSeconds = 30 }: CountdownOverlayProps) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, countdown / totalSeconds));
  const strokeDashoffset = circumference * (1 - progress);

  const isUrgent = countdown <= 10;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={`Sesión cerrando en ${countdown} segundos`}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm"
    >
      <div className="mx-4 w-full max-w-xs rounded-2xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl">
        {/* ── Progress ring ──────────────────────────────────────────────── */}
        <div className="relative inline-flex items-center justify-center mb-5">
          <svg width={120} height={120} viewBox="0 0 120 120" className="-rotate-90" aria-hidden>
            {/* Background track */}
            <circle
              cx={60}
              cy={60}
              r={radius}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={7}
              fill="none"
            />
            {/* Animated progress arc */}
            <circle
              cx={60}
              cy={60}
              r={radius}
              stroke={isUrgent ? "#EF4444" : "#00AEEF"}
              strokeWidth={7}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>

          {/* Countdown number */}
          <span
            className={cn(
              "absolute text-5xl font-bold tabular-nums leading-none",
              isUrgent ? "text-red-400" : "text-white"
            )}
          >
            {countdown}
          </span>
        </div>

        {/* ── Message ────────────────────────────────────────────────────── */}
        <p className="text-lg font-semibold text-white mb-1">¿Sigues ahí?</p>
        <p className="text-sm text-white/50 mb-7">
          La sesión se cerrará por inactividad en{" "}
          <span className={cn("font-semibold", isUrgent ? "text-red-400" : "text-white/80")}>
            {countdown} segundo{countdown !== 1 ? "s" : ""}
          </span>
        </p>

        {/* ── Button (any interaction resets the hook timer via window events) */}
        {/* The `mousedown` on this button propagates to window and resets   */}
        {/* the idle timer automatically — no explicit onClick needed.       */}
        <button
          type="button"
          className={cn(
            "w-full rounded-xl py-3.5 text-sm font-bold text-white transition-colors",
            isUrgent
              ? "bg-red-500 hover:bg-red-400 active:bg-red-600"
              : "bg-[#00AEEF] hover:bg-[#0099d6] active:bg-[#0088c0]"
          )}
        >
          Estoy aquí — continuar
        </button>
      </div>
    </div>
  );
}
