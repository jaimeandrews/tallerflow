"use client";

import { Download, FileText } from "lucide-react";
import type { RolUsuario } from "@/generated/prisma";
import { Button } from "@/components/ui/button";
import { FiltrosReporte } from "@/components/reportes/filtros-reporte";
import { KpisPeriodo } from "@/components/reportes/kpis-periodo";
import { ReporteTecnicos } from "@/components/reportes/reporte-tecnicos";
import { ReporteOrdenes } from "@/components/reportes/reporte-ordenes";
import { ReporteSucursales } from "@/components/reportes/reporte-sucursales";
import { GraficosReporte } from "@/components/reportes/graficos-reporte";
import { useReportes } from "@/hooks/useReportes";
import type { SucursalOption } from "@/types/reportes-ui";

interface Props {
  rol: RolUsuario;
  sucursalIdDefault: string;
  sucursales: SucursalOption[];
}

export function ReportesPageClient({ rol, sucursalIdDefault, sucursales }: Props) {
  const reporte = useReportes({ sucursalIdDefault, rol });
  const { filtros, filtrosEfectivos, setFiltros } = reporte;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reportes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Análisis de productividad y rendimiento del taller
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => reporte.exportar("csv")}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button
            size="sm"
            onClick={() => reporte.exportar("pdf")}
            className="gap-2 bg-[#006FA0] hover:bg-[#005a82] text-white"
          >
            <FileText className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </header>

      <FiltrosReporte filtros={filtros} onChange={setFiltros} rol={rol} sucursales={sucursales} />

      <KpisPeriodo
        resumen={reporte.resumen.data}
        loading={reporte.resumen.loading && !reporte.resumen.data}
        error={reporte.resumen.error}
      />

      {filtrosEfectivos.tipo === "tecnicos" && (
        <ReporteTecnicos
          filtros={filtrosEfectivos}
          data={reporte.tecnicos.data}
          loading={reporte.tecnicos.loading && reporte.tecnicos.data.length === 0}
          error={reporte.tecnicos.error}
        />
      )}
      {filtrosEfectivos.tipo === "ordenes" && (
        <ReporteOrdenes
          filtros={filtrosEfectivos}
          data={reporte.ordenes.data}
          loading={reporte.ordenes.loading && reporte.ordenes.data.length === 0}
          error={reporte.ordenes.error}
        />
      )}
      {filtrosEfectivos.tipo === "sucursales" && (
        <ReporteSucursales
          filtros={filtrosEfectivos}
          rol={rol}
          data={reporte.sucursales.data}
          loading={reporte.sucursales.loading && reporte.sucursales.data.length === 0}
          error={reporte.sucursales.error}
        />
      )}

      <GraficosReporte
        filtros={filtrosEfectivos}
        tecnicosData={reporte.tecnicos.data}
        sucursalesData={reporte.sucursales.data}
        hhDiarias={reporte.hhDiarias.data}
        loadingTec={reporte.tecnicos.loading}
        loadingSuc={reporte.sucursales.loading}
        loadingHH={reporte.hhDiarias.loading}
      />
    </div>
  );
}
