"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TecRowLive } from "./tec-row-live";
import { ErrorIndicator } from "./error-indicator";
import type { TecnicoEnTaller } from "@/types/dashboard";

interface Props {
  tecnicos: TecnicoEnTaller[];
  total: number;
  loading: boolean;
  error: string | null;
}

export function ListaTecnicosLive({ tecnicos, total, loading, error }: Props) {
  const enActividad = tecnicos.filter((t) => t.estado === "TRABAJANDO").length;

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-semibold text-slate-800">Técnicos en taller</h2>
          <ErrorIndicator error={error} />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          {enActividad} en actividad
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ maxHeight: 360 }}>
        {loading && tecnicos.length === 0 ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-7 w-7 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : tecnicos.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-400">
            No hay técnicos activos en la sucursal.
          </p>
        ) : (
          tecnicos.map((t) => <TecRowLive key={t.id} tecnico={t} />)
        )}
      </div>

      {/* Footer */}
      <Link
        href="/centro-control"
        className="group flex items-center justify-center gap-1 border-t border-slate-100 px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-[#006FA0]"
      >
        Ver los {total} técnicos
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
