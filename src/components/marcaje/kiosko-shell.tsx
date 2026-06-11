"use client";

import { useEffect, useState } from "react";
import { KioskoProvider } from "@/contexts/kiosko-context";
import { Toaster } from "@/components/ui/sonner";
import { ConnectionBadge } from "./ConnectionBadge";

function Clock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums text-sm text-white/60">{time}</span>;
}

interface KioskoShellProps {
  sucursalId: string;
  sucursalNombre: string;
  children: React.ReactNode;
}

export function KioskoShell({ sucursalId, sucursalNombre, children }: KioskoShellProps) {
  return (
    <KioskoProvider sucursalId={sucursalId}>
      {/* Full-screen dark container with grid pattern */}
      <div
        className="min-h-screen flex flex-col text-white overflow-hidden"
        style={{
          backgroundColor: "#0a0a0a",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.025) 1px,transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-white/8 flex-shrink-0">
          {/* Logo + title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00AEEF] flex items-center justify-center font-black text-sm text-white">
              T
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-bold text-white tracking-wide">TallerFlow</span>
              <span className="text-xs text-white/40">Marcaje</span>
            </div>
          </div>

          {/* Center: sucursal */}
          <span className="text-sm text-white/50 font-medium">{sucursalNombre}</span>

          {/* Right: status + clock */}
          <div className="flex items-center gap-4">
            <ConnectionBadge dark />
            <Clock />
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>

      <Toaster richColors position="top-center" />
    </KioskoProvider>
  );
}
