"use client";

import type { RolUsuario } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { calcularRango } from "@/lib/utils/fechas-reporte";
import { ROLES_SUCURSAL_REPORT } from "@/types/reportes";
import type { FiltroReporte, PeriodoRapido, SucursalOption } from "@/types/reportes-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface Props {
  filtros: FiltroReporte;
  onChange: (next: Partial<FiltroReporte>) => void;
  rol: RolUsuario;
  sucursales: SucursalOption[];
}

// ── Periodos rápidos ───────────────────────────────────────────────────────

const PERIODOS: { id: PeriodoRapido; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mes" },
  { id: "trimestre", label: "Último trimestre" },
  { id: "personalizado", label: "Personalizado" },
];

// ── Tipos de reporte ───────────────────────────────────────────────────────

const TIPOS: { id: FiltroReporte["tipo"]; label: string }[] = [
  { id: "tecnicos", label: "Por técnico" },
  { id: "ordenes", label: "Por OF" },
  { id: "sucursales", label: "Por sucursal" },
];

// ── Component ──────────────────────────────────────────────────────────────

export function FiltrosReporte({ filtros, onChange, rol, sucursales }: Props) {
  const puedeVerSucursales = ROLES_SUCURSAL_REPORT.includes(rol);
  const puedeElegirSucursal = rol === "ADMIN";

  function handlePeriodo(periodo: PeriodoRapido) {
    if (periodo === "personalizado") {
      onChange({ periodo });
      return;
    }
    const { desde, hasta } = calcularRango(periodo);
    onChange({ periodo, desde, hasta });
  }

  function handleTipo(tipo: FiltroReporte["tipo"]) {
    onChange({ tipo });
  }

  return (
    <div className="sticky top-0 z-20 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-4 items-end">
        {/* Periodo */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Periodo
          </span>
          <div className="flex flex-wrap gap-1">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePeriodo(p.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filtros.periodo === p.id
                    ? "bg-[#006FA0] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rango personalizado */}
        {filtros.periodo === "personalizado" && (
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Desde
              </span>
              <Input
                type="date"
                value={filtros.desde}
                max={filtros.hasta}
                onChange={(e) => onChange({ desde: e.target.value })}
                className="h-8 w-36 text-xs"
              />
            </div>
            <span className="mt-5 text-slate-400">—</span>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Hasta
              </span>
              <Input
                type="date"
                value={filtros.hasta}
                min={filtros.desde}
                onChange={(e) => onChange({ hasta: e.target.value })}
                className="h-8 w-36 text-xs"
              />
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="hidden sm:block h-8 w-px bg-slate-200" />

        {/* Sucursal */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Sucursal
          </span>
          <Select
            value={filtros.sucursalId || "todas"}
            onValueChange={(v) => onChange({ sucursalId: v === "todas" ? "" : v })}
            disabled={!puedeElegirSucursal}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {puedeElegirSucursal && (
                <SelectItem value="todas" className="text-xs">
                  Todas las sucursales
                </SelectItem>
              )}
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Divider */}
        <div className="hidden sm:block h-8 w-px bg-slate-200" />

        {/* Tipo de reporte */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Tipo de reporte
          </span>
          <div className="flex gap-1">
            {TIPOS.filter((t) => t.id !== "sucursales" || puedeVerSucursales).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTipo(t.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  filtros.tipo === t.id
                    ? "bg-slate-800 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rango visible */}
        <div className="ml-auto flex flex-col gap-0.5 text-right hidden md:flex">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Rango activo
          </span>
          <span className="text-xs font-medium text-slate-700">
            {filtros.desde} → {filtros.hasta}
          </span>
        </div>
      </div>
    </div>
  );
}
