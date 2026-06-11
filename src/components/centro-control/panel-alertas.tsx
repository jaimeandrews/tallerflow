"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bell, Check, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorIndicator } from "@/components/dashboard/error-indicator";
import { cn } from "@/lib/utils";
import type { AlertaActiva } from "@/types/centro-control";

interface Props {
  alertas: AlertaActiva[];
  loading: boolean;
  error?: string | null;
  onResolver: (alertaId: string) => Promise<{ ok: boolean; error?: string }>;
}

const NIVEL_CONFIG: Record<AlertaActiva["nivel"], { dot: string; glow: string; label: string }> = {
  critico: {
    dot: "bg-red-500",
    glow: "shadow-[0_0_10px_rgba(239,68,68,0.6)]",
    label: "Crítica",
  },
  warning: {
    dot: "bg-yellow-400",
    glow: "shadow-[0_0_10px_rgba(250,204,21,0.5)]",
    label: "Advertencia",
  },
  info: {
    dot: "bg-blue-400",
    glow: "shadow-[0_0_8px_rgba(96,165,250,0.4)]",
    label: "Info",
  },
};

export function PanelAlertas({ alertas, loading, error, onResolver }: Props) {
  const criticas = alertas.filter((a) => a.nivel === "critico").length;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 bg-red-50 px-4 py-3 border-b border-red-100">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <h2 className="text-base font-semibold text-red-700">Alertas activas</h2>
          <ErrorIndicator error={error ?? null} />
        </div>
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full min-w-[24px] h-6 px-2 text-xs font-bold",
            alertas.length === 0
              ? "bg-slate-200 text-slate-600"
              : criticas > 0
                ? "bg-red-600 text-white"
                : "bg-amber-500 text-white"
          )}
        >
          {alertas.length}
        </span>
      </div>

      {/* Body */}
      <div className="max-h-[460px] overflow-y-auto">
        {loading && alertas.length === 0 ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : alertas.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="mx-auto mb-2 h-5 w-5 text-slate-300" />
            <p className="text-sm text-slate-400">Sin alertas activas</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {alertas.map((a) => (
              <AlertaItem key={a.id} alerta={a} onResolver={onResolver} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AlertaItem({
  alerta,
  onResolver,
}: {
  alerta: AlertaActiva;
  onResolver: (alertaId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  // Animación slide-in al montar
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 20);
    return () => clearTimeout(t);
  }, []);

  const [resolving, setResolving] = useState(false);

  const handleResolver = async () => {
    if (resolving) return;
    setResolving(true);
    const res = await onResolver(alerta.id);
    if (!res.ok) {
      setResolving(false);
      toast.error(res.error ?? "No se pudo resolver la alerta");
    }
    // Si ok, la alerta desaparece de la lista (manejo optimista en el hook).
  };

  const handleAsignar = () => {
    toast.info("Asignar alerta — próximamente");
  };

  const cfg = NIVEL_CONFIG[alerta.nivel];

  return (
    <li
      className={cn(
        "p-3 transition-all duration-300 ease-out",
        mounted ? "opacity-100 translate-x-0" : "opacity-0 translate-x-3"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", cfg.dot, cfg.glow)}
          aria-label={cfg.label}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 leading-tight">{alerta.titulo}</p>
          <p className="mt-0.5 text-xs text-slate-500 leading-snug">{alerta.descripcion}</p>

          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={handleResolver}
              disabled={resolving}
            >
              <Check className="h-3 w-3 mr-1" />
              {resolving ? "Resolviendo…" : "Resolver"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-slate-500"
              onClick={handleAsignar}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Asignar
            </Button>
          </div>
        </div>
      </div>
    </li>
  );
}
