"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      (window.location.hostname === "localhost" && process.env.NODE_ENV === "development")
    ) {
      // In dev with disabled SW we still try, but tolerate failure
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        // In dev, the SW is intentionally disabled — log silently
        if (process.env.NODE_ENV !== "development") {
          console.error("SW registration failed:", err);
        }
      });
    }
  }, []);

  return null;
}
