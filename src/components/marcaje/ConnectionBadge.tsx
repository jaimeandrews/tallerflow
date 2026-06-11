"use client";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

interface ConnectionBadgeProps {
  dark?: boolean;
}

export function ConnectionBadge({ dark = false }: ConnectionBadgeProps) {
  const { isOnline, pendingCount, syncState } = useOnlineStatus();

  if (syncState === "syncing") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
        SINCRONIZANDO…
      </span>
    );
  }

  if (syncState === "success") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        EN LÍNEA · sincronizado ✓
      </span>
    );
  }

  if (!isOnline) {
    return (
      <span
        className={cn("flex items-center gap-1.5 text-xs font-semibold text-red-400 animate-pulse")}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        SIN CONEXIÓN
        {pendingCount > 0 && (
          <span className={cn("ml-1", dark ? "text-red-300/80" : "text-red-500/80")}>
            · {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-green-400">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      EN LÍNEA
      {pendingCount > 0 && (
        <span className={cn("ml-1", dark ? "text-yellow-300/80" : "text-amber-600")}>
          · {pendingCount} pendiente{pendingCount !== 1 ? "s" : ""}
        </span>
      )}
    </span>
  );
}
