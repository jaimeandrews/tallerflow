"use client";

import { useEffect, useState } from "react";

type ThemeValue = "light" | "dark";

const STORAGE_KEY = "tallerflow-theme";
const HTML = typeof document !== "undefined" ? document.documentElement : null;

function getInitialTheme(): ThemeValue {
  if (!HTML) return "light"; // SSR — safe default
  return HTML.classList.contains("dark") ? "dark" : "light";
}

/**
 * Manages the light/dark theme for the dashboard.
 *
 * Persists to localStorage under the key "tallerflow-theme".
 * The inline script in layout.tsx applies the class before React
 * hydrates, so there is no flash of wrong theme on page load.
 */
export function useTheme() {
  // Always start with "light" so SSR and client initial render agree.
  // The effect below syncs to the real theme (set by the anti-FOUC script)
  // after hydration, avoiding the server/client HTML mismatch.
  const [theme, setTheme] = useState<ThemeValue>("light");

  useEffect(() => {
    setTheme(getInitialTheme());
  }, []);

  const toggle = () => {
    const next: ThemeValue = theme === "dark" ? "light" : "dark";
    HTML?.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode */
    }
    setTheme(next);
  };

  return { theme, toggle, isDark: theme === "dark" };
}
