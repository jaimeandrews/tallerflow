import type { EstadoOF, PrioridadOF, RolUsuario } from "@/generated/prisma";

export const MAX_DIAS_REPORTE = 365;
export const MAX_DIAS_EXPORTAR = 90;

// ── Query schemas (para referencia) ───────────────────────────────────────

export interface ReporteRangoQuery {
  sucursalId?: string;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
}

// ── Productividad por técnico ──────────────────────────────────────────────

export interface DesgloseActividad {
  actividadId: string;
  nombre: string;
  color: string;
  productiva: boolean;
  hh: number;
  porcentaje: number;
}

export interface TecnicoProductividad {
  tecnicoId: string;
  nombre: string;
  iniciales: string;
  color: string;
  hhProductivas: number;
  hhNoProductivas: number;
  hhTotal: number;
  productividad: number;
  diasTrabajados: number;
  promedioHHDia: number;
  actividadPrincipal: string;
  ofAtendidas: number;
  desglosePorActividad: DesgloseActividad[];
  /** Productividad % por cada día del rango. Vacío si sin marcajes. */
  tendencia: number[];
}

// ── Productividad por OF ───────────────────────────────────────────────────

export interface DesgloseOFTecnico {
  tecnicoId: string;
  nombre: string;
  iniciales: string;
  color: string;
  hh: number;
}

export interface OFProductividad {
  ofId: string;
  numero: string;
  nombre: string;
  cliente: string;
  equipo: string;
  estado: EstadoOF;
  prioridad: PrioridadOF;
  hhEstimadas: number;
  hhConsumidas: number;
  desviacion: number;
  desviacionPorcentaje: number;
  eficiencia: number;
  tecnicosInvolucrados: number;
  tiempoNoProductivo: number;
  slaStatus: "cumplido" | "vencido" | "sin_sla";
  diasEnProceso: number;
  desglosePorTecnico: DesgloseOFTecnico[];
}

// ── Productividad por sucursal ─────────────────────────────────────────────

export const ROLES_SUCURSAL_REPORT: RolUsuario[] = ["ADMIN", "GERENTE_SUCURSAL", "CONTROL_GESTION"];

export interface SucursalProductividad {
  sucursalId: string;
  nombre: string;
  tecnicosActivos: number;
  ofTotal: number;
  ofFinalizadas: number;
  hhProductivas: number;
  hhNoProductivas: number;
  productividad: number;
  utilizacion: number;
  mttr: number;
  slaCumplimiento: number;
  tendencia: number[];
}

// ── Resumen periodo ────────────────────────────────────────────────────────

export interface ResumenPeriodo {
  totalHHProductivas: number;
  totalHHNoProductivas: number;
  totalHH: number;
  productividadPromedio: number;
  ofCreadas: number;
  ofFinalizadas: number;
  ofPendientes: number;
  tecnicoMasProductivo: { nombre: string; hh: number; productividad: number } | null;
  tecnicoMenosProductivo: { nombre: string; hh: number; productividad: number } | null;
  actividadMasConsumo: { nombre: string; hh: number } | null;
  diaMaxProductividad: { fecha: string; productividad: number } | null;
  diaMinProductividad: { fecha: string; productividad: number } | null;
  slaCumplimiento: number;
  mttrPromedio: number;
}

// ── Exportar ───────────────────────────────────────────────────────────────

export type TipoReporte = "tecnicos" | "ordenes" | "sucursales";
export type FormatoExportar = "csv" | "pdf";
