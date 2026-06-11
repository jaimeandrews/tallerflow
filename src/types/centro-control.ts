import type { EstadoOF } from "@/generated/prisma";

export interface CentroControlKpis {
  cargaTaller: {
    porcentaje: number;
    tecnicosActivos: number;
    tecnicosTotal: number;
  };
  ofEnCurso: {
    total: number;
    sobreSla: number;
  };
  tiempoNoProductivo: {
    horas: number;
    /** Variación porcentual vs. mismo periodo de ayer. Positivo = aumentó. */
    deltaPorcentajeAyer: number;
  };
  mttr: {
    horas: number;
    meta: number;
  };
  alertasActivas: {
    total: number;
    criticas: number;
    advertencias: number;
  };
}

// ── Ribbon de OF ──────────────────────────────────────────────────────────

export type SegmentoTipo = "trabajando" | "pausa" | "espera_repuesto" | "otro";

export interface RibbonSegmento {
  /** ISO timestamp del inicio del segmento. */
  inicio: string;
  /** ISO timestamp del fin del segmento. `null` si está en curso. */
  fin: string | null;
  tipo: SegmentoTipo;
  color: string;
  actividadNombre: string;
}

export interface RibbonOF {
  id: string;
  numero: string;
  nombre: string;
  estado: EstadoOF;
  estadoLabel: string;
  estadoColorClass: string;
  segmentos: RibbonSegmento[];
}

export interface RibbonResponse {
  ordenes: RibbonOF[];
  /** Inicio del rango horario del ribbon (ISO). Default 07:00 hoy. */
  rangoInicio: string;
  /** Fin del rango horario del ribbon (ISO). Default 18:00 hoy. */
  rangoFin: string;
}

// ── Mix de actividad ───────────────────────────────────────────────────────

export interface MixSegmento {
  actividadId: string;
  actividadNombre: string;
  productiva: boolean;
  horas: number;
  porcentaje: number;
  color: string;
}

export interface MixActividadResponse {
  segmentos: MixSegmento[];
  totalHoras: number;
  productivasPct: number;
  noProductivasPct: number;
}

// ── Alertas activas ────────────────────────────────────────────────────────

export type NivelAlerta = "info" | "warning" | "critico";

export interface AlertaActiva {
  id: string;
  titulo: string;
  descripcion: string;
  nivel: NivelAlerta;
  configuracionSlaId: string | null;
  datos: Record<string, unknown> | null;
  createdAt: string;
}

export interface AlertasActivasResponse {
  alertas: AlertaActiva[];
  total: number;
}
