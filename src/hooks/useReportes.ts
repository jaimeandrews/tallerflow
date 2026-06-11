"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { RolUsuario } from "@/generated/prisma";
import { useDebounce } from "@/lib/utils/use-debounce";
import { calcularRango } from "@/lib/utils/fechas-reporte";
import { useResumenPeriodo } from "./useResumenPeriodo";
import { useTecnicosReporte } from "./useTecnicosReporte";
import { useOrdenesReporte } from "./useOrdenesReporte";
import { useSucursalesReporte } from "./useSucursalesReporte";
import { useHHDiarias } from "./useHHDiarias";
import type { FiltroReporte, PeriodoRapido } from "@/types/reportes-ui";
import type {
  OFProductividad,
  ResumenPeriodo,
  SucursalProductividad,
  TecnicoProductividad,
} from "@/types/reportes";
import type { HHDiaria } from "./useHHDiarias";

// ── Intervalo de debounce para date pickers manuales ───────────────────────
const DATE_PICKER_DEBOUNCE_MS = 700;

// ── Export helpers (mismo código que tenía page-client) ────────────────────

function buildExportURL(filtros: FiltroReporte, formato: "csv" | "pdf"): string {
  const params = new URLSearchParams({
    tipo: filtros.tipo,
    formato,
    desde: filtros.desde,
    hasta: filtros.hasta,
  });
  if (filtros.sucursalId) params.set("sucursalId", filtros.sucursalId);
  return `/api/reportes/exportar?${params}`;
}

function triggerDownload(url: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Sección de datos con shape unificado ───────────────────────────────────

export interface SeccionReporte<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// ── Resultado del hook ─────────────────────────────────────────────────────

export interface UseReportesResult {
  /** Estado de filtros tal como lo ve la UI (sin debounce). */
  filtros: FiltroReporte;
  /**
   * Filtros efectivos usados para fetch: en modo "personalizado" las fechas
   * están debouncedas — evita un request por cada tecla al escribir la fecha.
   * Pasar SIEMPRE filtrosEfectivos a los view-components y a GraficosReporte.
   */
  filtrosEfectivos: FiltroReporte;
  setFiltros: (next: Partial<FiltroReporte>) => void;

  resumen: SeccionReporte<ResumenPeriodo | null>;
  tecnicos: SeccionReporte<TecnicoProductividad[]>;
  ordenes: SeccionReporte<OFProductividad[]>;
  sucursales: SeccionReporte<SucursalProductividad[]>;
  hhDiarias: SeccionReporte<HHDiaria[]>;

  exportar: (formato: "csv" | "pdf") => void;
  refetchAll: () => void;
  anyLoading: boolean;
  rol: RolUsuario;
}

// ── Hook ───────────────────────────────────────────────────────────────────

interface Options {
  sucursalIdDefault: string;
  rol: RolUsuario;
}

export function useReportes({ sucursalIdDefault, rol }: Options): UseReportesResult {
  const [filtros, setFiltrosRaw] = useState<FiltroReporte>(() => {
    const { desde, hasta } = calcularRango("mes");
    return {
      periodo: "mes",
      desde,
      hasta,
      sucursalId: sucursalIdDefault,
      tipo: "tecnicos",
    };
  });

  // Debounce solo se aplica a las fechas en modo personalizado.
  const debouncedDesde = useDebounce(filtros.desde, DATE_PICKER_DEBOUNCE_MS);
  const debouncedHasta = useDebounce(filtros.hasta, DATE_PICKER_DEBOUNCE_MS);

  const filtrosEfectivos: FiltroReporte = useMemo(
    () => ({
      ...filtros,
      desde: filtros.periodo === "personalizado" ? debouncedDesde : filtros.desde,
      hasta: filtros.periodo === "personalizado" ? debouncedHasta : filtros.hasta,
    }),
    [filtros, debouncedDesde, debouncedHasta]
  );

  const setFiltros = useCallback((next: Partial<FiltroReporte>) => {
    setFiltrosRaw((prev) => {
      // Periodos predefinidos calculan desde/hasta automáticamente.
      if (next.periodo && next.periodo !== "personalizado") {
        const rango = calcularRango(next.periodo as PeriodoRapido);
        return { ...prev, ...next, ...rango };
      }
      return { ...prev, ...next };
    });
  }, []);

  // ── Data hooks individuales — enabled solo cuando son necesarios ─────────

  const sucursalParam = filtrosEfectivos.sucursalId || undefined;

  const resumenHook = useResumenPeriodo({
    sucursalId: sucursalParam,
    desde: filtrosEfectivos.desde,
    hasta: filtrosEfectivos.hasta,
  });

  const tecnicosHook = useTecnicosReporte({
    sucursalId: sucursalParam,
    desde: filtrosEfectivos.desde,
    hasta: filtrosEfectivos.hasta,
    enabled: filtrosEfectivos.tipo === "tecnicos",
  });

  const ordenesHook = useOrdenesReporte({
    sucursalId: sucursalParam,
    desde: filtrosEfectivos.desde,
    hasta: filtrosEfectivos.hasta,
    enabled: filtrosEfectivos.tipo === "ordenes",
  });

  const sucursalesHook = useSucursalesReporte({
    desde: filtrosEfectivos.desde,
    hasta: filtrosEfectivos.hasta,
    enabled: filtrosEfectivos.tipo === "sucursales",
  });

  const hhDiariasHook = useHHDiarias({
    sucursalId: sucursalParam,
    desde: filtrosEfectivos.desde,
    hasta: filtrosEfectivos.hasta,
  });

  // ── Acciones ──────────────────────────────────────────────────────────────

  const exportar = useCallback(
    (formato: "csv" | "pdf") => {
      const diasDiff = Math.ceil(
        (new Date(filtrosEfectivos.hasta).getTime() - new Date(filtrosEfectivos.desde).getTime()) /
          86_400_000
      );
      if (diasDiff > 90) {
        toast.warning("Para exportar el rango no puede superar 90 días.");
        return;
      }
      const url = buildExportURL(filtrosEfectivos, formato);
      toast.info(`Generando ${formato.toUpperCase()}…`);
      triggerDownload(url);
    },
    [filtrosEfectivos]
  );

  const refetchAll = useCallback(() => {
    void resumenHook.refetch();
    void tecnicosHook.refetch();
    void ordenesHook.refetch();
    void sucursalesHook.refetch();
    void hhDiariasHook.refetch();
  }, [
    resumenHook.refetch,
    tecnicosHook.refetch,
    ordenesHook.refetch,
    sucursalesHook.refetch,
    hhDiariasHook.refetch,
  ]);

  const anyLoading =
    resumenHook.loading ||
    tecnicosHook.loading ||
    ordenesHook.loading ||
    sucursalesHook.loading ||
    hhDiariasHook.loading;

  return {
    filtros,
    filtrosEfectivos,
    setFiltros,

    resumen: {
      data: resumenHook.data,
      loading: resumenHook.loading,
      error: resumenHook.error,
      refetch: resumenHook.refetch,
    },
    tecnicos: {
      data: tecnicosHook.data,
      loading: tecnicosHook.loading,
      error: tecnicosHook.error,
      refetch: tecnicosHook.refetch,
    },
    ordenes: {
      data: ordenesHook.data,
      loading: ordenesHook.loading,
      error: ordenesHook.error,
      refetch: ordenesHook.refetch,
    },
    sucursales: {
      data: sucursalesHook.data,
      loading: sucursalesHook.loading,
      error: sucursalesHook.error,
      refetch: sucursalesHook.refetch,
    },
    hhDiarias: {
      data: hhDiariasHook.data,
      loading: hhDiariasHook.loading,
      error: hhDiariasHook.error,
      refetch: hhDiariasHook.refetch,
    },

    exportar,
    refetchAll,
    anyLoading,
    rol,
  };
}
