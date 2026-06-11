"use client";

import { useState, useEffect } from "react";
import { countPendingMarcajes } from "@/lib/offline/offline-store";
import { onSyncStateChange } from "@/lib/offline/offline-sync";

export type SyncState = "idle" | "syncing" | "success";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncState, setSyncState] = useState<SyncState>("idle");

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const refreshCount = () => {
      countPendingMarcajes()
        .then(setPendingCount)
        .catch(() => setPendingCount(0));
    };

    refreshCount();

    const handleOnline = () => {
      setIsOnline(true);
      refreshCount();
    };
    const handleOffline = () => {
      setIsOnline(false);
      refreshCount();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    const unsub = onSyncStateChange((s) => {
      setSyncState(s);
      refreshCount();
    });

    // Refresh count every 10s in case other tabs enqueue marcajes
    const id = setInterval(refreshCount, 10_000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      unsub();
      clearInterval(id);
    };
  }, []);

  return { isOnline, pendingCount, syncState };
}
