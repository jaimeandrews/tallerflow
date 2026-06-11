"use client";

import { AlertTriangle } from "lucide-react";
import { KpiCard, type KpiTono } from "@/components/dashboard/kpi-card";
import type { CentroControlKpis } from "@/types/centro-control";

interface Props {
  kpis: CentroControlKpis | null;
  loading: boolean;
  error?: string | null;
}

function formatHoras(h: number): string {
  return h.toFixed(1);
}

function signoPct(n: number): string {
  if (n > 0) return `+${n}%`;
  return `${n}%`;
}

export function KpisFilaCentroControl({ kpis, loading, error }: Props) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiCard key={i} titulo="" valor="" loading tono="default" />
        ))}
      </div>
    );
  }

  // Card 4 — MTTR tone: good si por debajo de meta
  const mttrTono: KpiTono = kpis.mttr.horas <= kpis.mttr.meta ? "good" : "warn";

  // Card 5 — Alertas: danger si hay críticas
  const alertasTono: KpiTono = kpis.alertasActivas.criticas > 0 ? "danger" : "default";
  const alertasTrend =
    kpis.alertasActivas.criticas === 0 && kpis.alertasActivas.advertencias === 0
      ? "Sin alertas activas"
      : `${kpis.alertasActivas.criticas} crítica${kpis.alertasActivas.criticas === 1 ? "" : "s"} · ${kpis.alertasActivas.advertencias} advertencia${kpis.alertasActivas.advertencias === 1 ? "" : "s"}`;

  return (
    <div className="space-y-2">
      {kpis && error && (
        <div
          className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700"
          role="status"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Indicadores podrían estar desactualizados · {error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* 1. Carga del taller */}
        <KpiCard
          titulo="Carga del taller"
          valor={`${kpis.cargaTaller.porcentaje}%`}
          trend={`${kpis.cargaTaller.tecnicosActivos} de ${kpis.cargaTaller.tecnicosTotal} técnicos activos`}
          tono="accent"
        />

        {/* 2. OF en curso */}
        <KpiCard
          titulo="OF en curso"
          valor={kpis.ofEnCurso.total}
          trend={
            kpis.ofEnCurso.sobreSla === 0
              ? "Todas dentro de SLA"
              : `${kpis.ofEnCurso.sobreSla} sobre SLA`
          }
          tono="default"
        />

        {/* 3. Tiempo no productivo */}
        <KpiCard
          titulo="Tiempo no productivo"
          valor={formatHoras(kpis.tiempoNoProductivo.horas)}
          unidad="h"
          trend={`${signoPct(kpis.tiempoNoProductivo.deltaPorcentajeAyer)} vs ayer`}
          trendIcon={
            kpis.tiempoNoProductivo.deltaPorcentajeAyer > 0
              ? "up"
              : kpis.tiempoNoProductivo.deltaPorcentajeAyer < 0
                ? "down"
                : "flat"
          }
          tono="warn"
        />

        {/* 4. MTTR promedio */}
        <KpiCard
          titulo="MTTR promedio"
          valor={formatHoras(kpis.mttr.horas)}
          unidad="h"
          trend={`meta ${kpis.mttr.meta}h`}
          tono={mttrTono}
        />

        {/* 5. Alertas activas */}
        <KpiCard
          titulo="Alertas activas"
          valor={kpis.alertasActivas.total}
          trend={alertasTrend}
          tono={alertasTono}
        />
      </div>
    </div>
  );
}
