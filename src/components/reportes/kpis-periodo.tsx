"use client";

import { AlertTriangle } from "lucide-react";
import { KpiCard, type KpiTono } from "@/components/dashboard/kpi-card";
import type { ResumenPeriodo } from "@/types/reportes";

const META_PRODUCTIVIDAD = 75;
const META_MTTR_HORAS = 8;
const META_SLA_BUENO = 90;

interface Props {
  resumen: ResumenPeriodo | null;
  loading: boolean;
  error?: string | null;
}

export function KpisPeriodo({ resumen, loading, error }: Props) {
  const numOfs = resumen?.ofCreadas ?? 0;

  if (loading || !resumen) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCard key={i} titulo="" valor="" loading />
        ))}
      </div>
    );
  }

  // Tonos calculados
  const productividadTono: KpiTono =
    resumen.productividadPromedio >= META_PRODUCTIVIDAD ? "good" : "warn";
  const slaTono: KpiTono = resumen.slaCumplimiento >= META_SLA_BUENO ? "good" : "danger";
  const mttrTono: KpiTono =
    resumen.mttrPromedio > 0 && resumen.mttrPromedio <= META_MTTR_HORAS
      ? "good"
      : resumen.mttrPromedio > META_MTTR_HORAS
        ? "warn"
        : "default";

  return (
    <div className="space-y-2">
      {/* Error indicator */}
      {resumen && error && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700"
          role="status"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Los indicadores podrían estar desactualizados · {error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. HH Productivas */}
        <KpiCard
          titulo="HH Productivas"
          valor={resumen.totalHHProductivas.toFixed(1)}
          unidad="h"
          trend={`de ${resumen.totalHH.toFixed(1)} h totales registradas`}
          tono="accent"
        />

        {/* 2. Productividad promedio */}
        <KpiCard
          titulo="Productividad promedio"
          valor={`${resumen.productividadPromedio}%`}
          trend={
            resumen.productividadPromedio >= META_PRODUCTIVIDAD
              ? `▲ ${resumen.productividadPromedio - META_PRODUCTIVIDAD}% sobre meta ${META_PRODUCTIVIDAD}%`
              : `▼ ${META_PRODUCTIVIDAD - resumen.productividadPromedio}% bajo meta ${META_PRODUCTIVIDAD}%`
          }
          tono={productividadTono}
        />

        {/* 3. OF finalizadas */}
        <KpiCard
          titulo="OF finalizadas"
          valor={resumen.ofFinalizadas}
          trend={`de ${numOfs} OF creadas en el periodo`}
          tono={numOfs > 0 && resumen.ofFinalizadas === numOfs ? "good" : "default"}
        />

        {/* 4. SLA cumplimiento */}
        <KpiCard
          titulo="SLA cumplimiento"
          valor={`${resumen.slaCumplimiento}%`}
          trend={
            resumen.slaCumplimiento >= META_SLA_BUENO
              ? "Dentro del objetivo de calidad"
              : `Por debajo del objetivo (meta ${META_SLA_BUENO}%)`
          }
          tono={slaTono}
        />

        {/* 5. MTTR promedio */}
        <KpiCard
          titulo="MTTR promedio"
          valor={resumen.mttrPromedio > 0 ? resumen.mttrPromedio.toFixed(1) : "—"}
          unidad={resumen.mttrPromedio > 0 ? "h" : undefined}
          trend={
            resumen.mttrPromedio > 0
              ? `meta ${META_MTTR_HORAS}h · ${
                  resumen.mttrPromedio <= META_MTTR_HORAS
                    ? "dentro de tiempo objetivo"
                    : "supera tiempo objetivo"
                }`
              : "Sin OF finalizadas en el periodo"
          }
          tono={mttrTono}
        />

        {/* 6. Mejor técnico */}
        <KpiCard
          titulo="Mejor técnico"
          valor={resumen.tecnicoMasProductivo?.nombre ?? "—"}
          trend={
            resumen.tecnicoMasProductivo
              ? `${resumen.tecnicoMasProductivo.productividad}% productividad · ${resumen.tecnicoMasProductivo.hh.toFixed(1)}h`
              : "Sin datos de técnicos en el periodo"
          }
          tono={resumen.tecnicoMasProductivo ? "good" : "default"}
        />
      </div>
    </div>
  );
}
