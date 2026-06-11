"use client";

import { useState } from "react";
import { TecCardLive, TecCardSkeleton } from "./tec-card-live";
import { SheetDetalleTecnico } from "./sheet-detalle-tecnico";
import { ErrorIndicator } from "@/components/dashboard/error-indicator";
import type { TecnicoEnTaller } from "@/types/dashboard";

interface Props {
  tecnicos: TecnicoEnTaller[];
  loading: boolean;
  error?: string | null;
}

export function GridTecnicosLive({ tecnicos, loading, error }: Props) {
  const [seleccionado, setSeleccionado] = useState<TecnicoEnTaller | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleClick = (t: TecnicoEnTaller) => {
    setSeleccionado(t);
    setSheetOpen(true);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-base font-semibold text-slate-800">Estado de técnicos · live</h2>
            <ErrorIndicator error={error ?? null} />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Click un técnico para ver su detalle</p>
        </div>
      </div>

      {/* Grid */}
      {loading && tecnicos.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <TecCardSkeleton key={i} />
          ))}
        </div>
      ) : tecnicos.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No hay técnicos en la sucursal.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tecnicos.map((t) => (
            <TecCardLive key={t.id} tecnico={t} onClick={handleClick} />
          ))}
        </div>
      )}

      {/* Detail sheet */}
      <SheetDetalleTecnico tecnico={seleccionado} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
