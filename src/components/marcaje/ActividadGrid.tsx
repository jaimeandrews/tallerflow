"use client";

import {
  Activity,
  Clock,
  Coffee,
  Flag,
  Gauge,
  Hammer,
  HardHat,
  Layers,
  Package,
  Pause,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  Truck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/** Debe cubrir todos los ids que ofrece Configuración (ver ICONOS en
 *  seccion-actividades.tsx) más los que usa prisma/seed.ts. Si falta uno, la
 *  actividad cae al icono por defecto y se ve idéntica a otras en el kiosco. */
const ICON_MAP: Record<string, LucideIcon> = {
  // Configuración
  wrench: Wrench,
  hammer: Hammer,
  activity: Activity,
  gauge: Gauge,
  layers: Layers,
  "hard-hat": HardHat,
  package: Package,
  truck: Truck,
  coffee: Coffee,
  pause: Pause,
  users: Users,
  flag: Flag,
  zap: Zap,
  timer: Timer,
  clock: Clock,
  // Seed
  search: Search,
  "shield-check": ShieldCheck,
  trash: Trash2,
};

export interface ActividadItem {
  id: string;
  nombre: string;
  color: string;
  icono: string | null;
  productiva: boolean;
}

interface ActividadGridProps {
  actividades: ActividadItem[];
  onSelect: (a: ActividadItem) => void;
  dark?: boolean;
}

export function ActividadGrid({ actividades, onSelect, dark = false }: ActividadGridProps) {
  const productivas = actividades.filter((a) => a.productiva);
  const noProductivas = actividades.filter((a) => !a.productiva);

  const renderGroup = (items: ActividadItem[], title: string) => (
    <div className="space-y-2">
      <p
        className={cn(
          "text-xs font-medium uppercase tracking-widest",
          dark ? "text-white/40" : "text-slate-400"
        )}
      >
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((a) => {
          const Icon = ICON_MAP[a.icono ?? ""] ?? Wrench;
          return (
            <button
              key={a.id}
              onClick={() => onSelect(a)}
              className={cn(
                "flex items-center gap-3 p-3 rounded-xl text-left",
                "transition-all duration-150 active:scale-[0.97]",
                dark
                  ? "bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20"
                  : "bg-slate-50 hover:bg-slate-100 border border-slate-200"
              )}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${a.color}20` }}
              >
                <Icon size={18} style={{ color: a.color }} />
              </div>
              <span
                className={cn(
                  "text-sm font-medium leading-tight",
                  dark ? "text-white/85" : "text-slate-700"
                )}
              >
                {a.nombre}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {productivas.length > 0 && renderGroup(productivas, "Productivas")}
      {noProductivas.length > 0 && renderGroup(noProductivas, "No productivas")}
    </div>
  );
}
