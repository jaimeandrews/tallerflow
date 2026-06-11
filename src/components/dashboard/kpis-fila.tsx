"use client";

import { AlertTriangle } from "lucide-react";
import { KpiCard, type KpiTono } from "./kpi-card";
import type { DashboardKpis } from "@/types/dashboard";

interface KpisFilaProps {
  kpis: DashboardKpis | null;
  loading: boolean;
  error?: string | null;
}

function formatHoras(h: number): string {
  return h.toFixed(1);
}

function signo(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function trendIconFromDelta(delta: number): "up" | "down" | "flat" {
  if (delta > 0) return "up";
  if (delta < 0) return "down";
  return "flat";
}

export function KpisFila({ kpis, loading, error }: KpisFilaProps) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <KpiCard key={i} titulo="" valor="" loading tono="default" />
        ))}
      </div>
    );
  }

  // Card 3 — Productividad tone
  const productividadTono: KpiTono =
    kpis.productividadHoy >= kpis.metaProductividad ? "good" : "warn";

  // Card 5 — HH no productivas
  const hhExcedente = Math.max(0, kpis.hhNoProductivas - (kpis.hhDisponibles * 10) / 100);
  const hhNoProductivasTrend = kpis.hhSobreUmbral
    ? `+${formatHoras(hhExcedente)}h · sobre umbral`
    : `${((kpis.hhNoProductivas / Math.max(1, kpis.hhDisponibles)) * 100).toFixed(0)}% del total`;

  // Card 6 — OF críticas
  const ofCriticasTono: KpiTono = kpis.ofCriticas > 0 ? "danger" : "default";
  const tecnicosDetenidosText =
    kpis.tecnicosDetenidos === 1
      ? "1 técnico detenido"
      : `${kpis.tecnicosDetenidos} técnicos detenidos`;

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1. Técnicos activos */}
        <KpiCard
          titulo="Técnicos activos"
          valor={`${kpis.tecnicosActivos}/${kpis.tecnicosTotal}`}
          trend={`${signo(kpis.deltaTecnicosAyer)} vs ayer · ${kpis.disponibilidad}% disponibilidad`}
          tono="accent"
        />

        {/* 2. OF en proceso */}
        <KpiCard
          titulo="OF en proceso"
          valor={kpis.ofEnProceso}
          trend={`${Math.abs(kpis.deltaOfAyer)} vs ayer`}
          trendIcon={trendIconFromDelta(kpis.deltaOfAyer)}
          tono="default"
        />

        {/* 3. Productividad hoy */}
        <KpiCard
          titulo="Productividad hoy"
          valor={`${kpis.productividadHoy}%`}
          trend={`Meta turno: ${kpis.metaProductividad}%`}
          tono={productividadTono}
        />

        {/* 4. HH productivas */}
        <KpiCard
          titulo="HH productivas"
          valor={formatHoras(kpis.hhProductivas)}
          unidad="h"
          trend={`de ${formatHoras(kpis.hhDisponibles)} h disponibles`}
          tono="default"
        />

        {/* 5. HH no productivas */}
        <KpiCard
          titulo="HH no productivas"
          valor={formatHoras(kpis.hhNoProductivas)}
          unidad="h"
          trend={hhNoProductivasTrend}
          tono={kpis.hhSobreUmbral ? "warn" : "default"}
        />

        {/* 6. OF críticas */}
        <KpiCard
          titulo="OF críticas"
          valor={kpis.ofCriticas}
          trend={tecnicosDetenidosText}
          tono={ofCriticasTono}
        />
      </div>
    </div>
  );
}
