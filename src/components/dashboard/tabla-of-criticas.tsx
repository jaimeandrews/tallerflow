"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ErrorIndicator } from "./error-indicator";
import type { OFCritica } from "@/types/dashboard";

interface Props {
  ordenes: OFCritica[];
  total: number;
  loading: boolean;
  error: string | null;
}

const SLA_PILL: Record<OFCritica["slaStatus"], string> = {
  vencida: "bg-red-100 text-red-700",
  warning: "bg-amber-100 text-amber-700",
  ok: "bg-slate-100 text-slate-600",
};

export function TablaOFCriticas({ ordenes, total, loading, error }: Props) {
  const router = useRouter();
  const criticas = ordenes.filter((o) => o.critica).length;

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">Órdenes que requieren atención</h2>
          <ErrorIndicator error={error} />
          {criticas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              <AlertTriangle className="h-3 w-3" />
              {criticas} crítica{criticas === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <Link
          href="/ordenes"
          className="group inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#006FA0]"
        >
          Ver todas
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-x-auto">
        {loading && ordenes.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : ordenes.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400">
            No hay órdenes que requieran atención.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2">OF</th>
                <th className="px-2 py-2">Proyecto</th>
                <th className="px-2 py-2">Cliente / equipo</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2">HH</th>
                <th className="px-4 py-2 text-right">SLA</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((of) => (
                <tr
                  key={of.id}
                  onClick={() => router.push(`/ordenes?of=${encodeURIComponent(of.numero)}`)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-2.5 align-middle">
                    <span className="font-mono text-xs font-semibold text-slate-800">
                      {of.numero}
                    </span>
                    {of.critica && (
                      <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />
                    )}
                  </td>
                  <td className="px-2 py-2.5 align-middle">
                    <span className="text-xs text-slate-700">{of.proyecto}</span>
                  </td>
                  <td className="px-2 py-2.5 align-middle">
                    <div className="flex flex-col leading-tight">
                      <span className="text-xs font-medium text-slate-700 truncate max-w-[160px]">
                        {of.cliente}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[160px]">
                        {of.equipo}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 align-middle">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-[10px] font-semibold",
                        of.estado.colorClass
                      )}
                    >
                      <span className={cn("h-1.5 w-1.5 rounded-full", of.estado.dotColorClass)} />
                      {of.estado.label}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 align-middle">
                    <ProgresoHH
                      consumidas={of.hhConsumidas}
                      estimadas={of.hhEstimadas}
                      porcentaje={of.porcentajeHH}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right align-middle">
                    <SlaCell
                      status={of.slaStatus}
                      delta={of.slaDelta}
                      slaVencimiento={of.slaVencimiento}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > ordenes.length && (
        <p className="border-t border-slate-100 px-4 py-2 text-center text-[11px] text-slate-400">
          Mostrando {ordenes.length} de {total}
        </p>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ProgresoHH({
  consumidas,
  estimadas,
  porcentaje,
}: {
  consumidas: number;
  estimadas: number;
  porcentaje: number;
}) {
  const ancho = Math.min(100, porcentaje);
  const excedido = porcentaje > 100;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="h-1.5 w-20 rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full",
            excedido ? "bg-red-500" : porcentaje >= 80 ? "bg-amber-500" : "bg-[#006FA0]"
          )}
          style={{ width: `${ancho}%` }}
        />
      </div>
      <span
        className={cn(
          "font-mono text-[10px] tabular-nums",
          excedido ? "text-red-600" : "text-slate-500"
        )}
      >
        {consumidas.toFixed(1)}/{estimadas.toFixed(1)} h
      </span>
    </div>
  );
}

function SlaCell({
  status,
  delta,
  slaVencimiento,
}: {
  status: OFCritica["slaStatus"];
  delta: string | null;
  slaVencimiento: string | null;
}) {
  if (status === "vencida" && delta) {
    return (
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", SLA_PILL.vencida)}>
        {delta} SLA
      </span>
    );
  }
  if (status === "warning" && delta) {
    return (
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", SLA_PILL.warning)}>
        {delta}
      </span>
    );
  }
  return (
    <span className="text-[10px] text-slate-400">
      {slaVencimiento ? formatFechaCorta(slaVencimiento) : "—"}
    </span>
  );
}

function formatFechaCorta(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${min}`;
}
