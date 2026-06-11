"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "tallerflow-noc-mode";
const BODY_CLASS = "tallerflow-noc-mode";

// ── Context ────────────────────────────────────────────────────────────────

interface NocModeContextValue {
  nocMode: boolean;
  toggleNoc: () => void;
  setNocMode: (v: boolean) => void;
  /** True solo después de leer localStorage (evita flash en SSR/hydration). */
  hydrated: boolean;
}

const NocModeContext = createContext<NocModeContextValue>({
  nocMode: false,
  toggleNoc: () => {},
  setNocMode: () => {},
  hydrated: false,
});

export function useNocMode(): NocModeContextValue {
  return useContext(NocModeContext);
}

// ── Provider ───────────────────────────────────────────────────────────────

export function NocModeProvider({ children }: { children: React.ReactNode }) {
  const [nocMode, setNocModeState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Lectura inicial de localStorage tras montar (evita hydration mismatch).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setNocModeState(true);
    } catch {
      // localStorage no disponible (modo incógnito estricto) — ignorar.
    }
    setHydrated(true);
  }, []);

  // Toggle de body class + persistencia.
  useEffect(() => {
    if (!hydrated) return;
    if (nocMode) {
      document.body.classList.add(BODY_CLASS);
    } else {
      document.body.classList.remove(BODY_CLASS);
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, nocMode ? "1" : "0");
    } catch {
      // ignorar
    }

    return () => {
      // Si el componente que monta el provider se desmonta (navegación a otra
      // página), limpiamos el body class para que el resto de la app no quede
      // afectada.
      document.body.classList.remove(BODY_CLASS);
    };
  }, [nocMode, hydrated]);

  // Esc para salir.
  useEffect(() => {
    if (!nocMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNocModeState(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nocMode]);

  const toggleNoc = useCallback(() => setNocModeState((v) => !v), []);
  const setNocMode = useCallback((v: boolean) => setNocModeState(v), []);

  return (
    <NocModeContext.Provider value={{ nocMode, toggleNoc, setNocMode, hydrated }}>
      {children}
    </NocModeContext.Provider>
  );
}

// ── Toggle button ──────────────────────────────────────────────────────────

export function NocModeToggle({ className }: { className?: string }) {
  const { nocMode, toggleNoc } = useNocMode();
  return (
    <button
      type="button"
      onClick={toggleNoc}
      aria-pressed={nocMode}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        nocMode
          ? "border-white/20 bg-white/5 text-white hover:bg-white/10"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        className
      )}
      title={nocMode ? "Salir de modo NOC (Esc)" : "Activar modo NOC"}
    >
      {nocMode ? (
        <>
          <Minimize2 className="h-4 w-4" />
          Salir NOC
        </>
      ) : (
        <>
          <Maximize2 className="h-4 w-4" />
          Modo NOC
        </>
      )}
    </button>
  );
}

// ── Layout wrapper ─────────────────────────────────────────────────────────
// Aplica el estilo "denso" cuando NOC está activo: ocupa la pantalla completa
// (gracias a `body.tallerflow-noc-mode` que oculta sidebar y topbar vía CSS), usa
// un slate-900 que es más denso que el dashboard normal pero NO tan oscuro
// como el kiosco (#0a0a0a).

export function NocWrapper({ children }: { children: React.ReactNode }) {
  const { nocMode } = useNocMode();
  return (
    <div
      className={cn(
        "space-y-6 transition-colors duration-200",
        nocMode &&
          // -mx/-my saca el padding del <main> del dashboard layout para que
          // el bg cubra de borde a borde. CSS global hace lo mismo con el
          // sidebar/topbar.
          "min-h-[calc(100vh-1rem)] -mx-4 -my-4 bg-slate-900 px-6 py-6 text-slate-100 lg:-mx-6 lg:-my-6"
      )}
    >
      {children}
    </div>
  );
}
