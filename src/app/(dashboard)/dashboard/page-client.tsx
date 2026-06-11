"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Plus, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { RolUsuario } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DialogOrden } from "@/components/ordenes/dialog-orden";
import { KpisFila } from "@/components/dashboard/kpis-fila";
import { ListaTecnicosLive } from "@/components/dashboard/lista-tecnicos-live";
import { TablaOFCriticas } from "@/components/dashboard/tabla-of-criticas";
import { TimelineOperacional } from "@/components/dashboard/timeline-operacional";
import { useDashboard } from "@/hooks/useDashboard";
import { useAlertaNotifications } from "@/hooks/useAlertaNotifications";
import { useSucursalActiva } from "@/contexts/sucursal-context";
import type { SucursalInfo } from "@/types/ordenes";

// Recharts (AreaChart) is a heavy library — load it only when the dashboard
// is visible rather than including it in the initial JS bundle.
const GraficoProductividad = dynamic(
  () => import("@/components/dashboard/grafico-productividad").then((m) => m.GraficoProductividad),
  {
    loading: () => <Skeleton className="h-[280px] w-full rounded-xl" />,
    ssr: false, // Recharts uses browser-only ResizeObserver via ResponsiveContainer
  }
);

interface Props {
  rol: RolUsuario;
  nombreUsuario: string;
  sucursales: SucursalInfo[];
  sucursalActivaId: string;
  canSelectSucursal: boolean;
  canCreateOF: boolean;
}

function saludoSegunHora(h: number): string {
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function DashboardPageClient({
  rol: _rol,
  nombreUsuario,
  sucursales: _sucursales,
  sucursalActivaId: _initialId,
  canSelectSucursal,
  canCreateOF,
}: Props) {
  const [saludo, setSaludo] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { sucursalActivaId, sucursales } = useSucursalActiva();

  useEffect(() => {
    setSaludo(saludoSegunHora(new Date().getHours()));
  }, []);

  const sucursalIdParam = canSelectSucursal ? sucursalActivaId : undefined;
  const dashboard = useDashboard({ sucursalId: sucursalIdParam });

  useAlertaNotifications();

  const { kpis, chart, tecnicos, ofCriticas, timeline, refetchAll } = dashboard;
  const kpisData = kpis.data;
  const anyLoading =
    kpis.loading || chart.loading || tecnicos.loading || ofCriticas.loading || timeline.loading;

  const subtexto = useMemo(() => {
    if (!kpisData) return "Cargando indicadores…";
    return `${kpisData.tecnicosActivos} técnico${kpisData.tecnicosActivos === 1 ? "" : "s"} productivo${kpisData.tecnicosActivos === 1 ? "" : "s"} · ${kpisData.ofEnProceso} OF en curso · taller al ${kpisData.disponibilidad}% de su capacidad.`;
  }, [kpisData]);

  const titulo = saludo ? `${saludo}, ${nombreUsuario}.` : `Hola, ${nombreUsuario}.`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800 truncate">{titulo}</h1>
          <p
            className={`mt-1 text-sm ${
              kpis.loading && !kpisData ? "text-slate-400" : "text-slate-500"
            }`}
          >
            {subtexto}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={refetchAll}
            disabled={anyLoading}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Refrescar dashboard"
          >
            <RefreshCw className={`h-4 w-4 ${anyLoading ? "animate-spin" : ""}`} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Cambiar turno — próximamente")}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Cambiar turno
          </Button>

          {canCreateOF && (
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="gap-2 bg-[#006FA0] hover:bg-[#005a82] text-white"
            >
              <Plus className="h-4 w-4" />
              Nueva orden de trabajo
            </Button>
          )}
        </div>
      </header>

      {/* KPIs */}
      <KpisFila kpis={kpisData} loading={kpis.loading && !kpisData} error={kpis.error} />

      {/* Fila principal: gráfico + técnicos */}
      <div className="grid gap-4 min-[1200px]:grid-cols-[1fr_320px]">
        <GraficoProductividad
          data={chart.data}
          pico={chart.pico}
          promedio={chart.promedio}
          loading={chart.loading}
          error={chart.error}
          periodo={chart.periodo}
          onPeriodoChange={chart.setPeriodo}
        />
        <ListaTecnicosLive
          tecnicos={tecnicos.data}
          total={tecnicos.total}
          loading={tecnicos.loading}
          error={tecnicos.error}
        />
      </div>

      {/* Segunda fila: OF críticas + timeline */}
      <div className="grid gap-4 min-[1200px]:grid-cols-[1fr_320px]">
        <TablaOFCriticas
          ordenes={ofCriticas.data}
          total={ofCriticas.total}
          loading={ofCriticas.loading}
          error={ofCriticas.error}
        />
        <TimelineOperacional
          eventos={timeline.data}
          loading={timeline.loading}
          error={timeline.error}
        />
      </div>

      {canCreateOF && (
        <DialogOrden
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          orden={null}
          sucursales={sucursales}
          sucursalIdDefault={sucursalActivaId}
          canSelectSucursal={canSelectSucursal}
          onSuccess={() => {
            toast.success("Orden de trabajo creada");
            refetchAll();
          }}
        />
      )}
    </div>
  );
}
