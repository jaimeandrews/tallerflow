import type { TipoMarcaje } from "@/generated/prisma";

export interface ActividadInfo {
  id: string;
  nombre: string;
  color: string;
  icono: string | null;
  productiva: boolean;
}

export interface OrdenInfo {
  id: string;
  numero: string;
  nombre: string;
  cliente: string;
  // Extended fields returned by /api/marcaje/activo
  equipo?: string;
  prioridad?: string;
  hhEstimadas?: number;
  hhConsumidas?: number;
  critica?: boolean;
}

export interface MarcajeBase {
  id: string;
  tipo: TipoMarcaje;
  horaInicio: string;
  horaFin: string | null;
  duracionMinutos: number | null;
  notas: string | null;
  actividad: ActividadInfo;
  ordenTrabajo: OrdenInfo | null;
}

export interface MarcajeActivo extends MarcajeBase {
  duracionVivo: number; // seconds since horaInicio
}

export type MarcajeHistorial = MarcajeBase;

export interface ResumenHH {
  productivas: number;
  noProductivas: number;
  total: number;
}

export interface HistorialHoyResponse {
  marcajes: MarcajeHistorial[];
  resumen: ResumenHH;
}

export interface SyncOfflineItem {
  idOffline: string;
  actividadId: string;
  ordenTrabajoId?: string;
  tipo: "INICIO" | "FIN" | "PAUSA" | "REANUDACION";
  horaInicio: string;
  horaFin?: string;
  dispositivo?: string;
  notas?: string;
}

export interface SyncOfflineResult {
  sincronizados: number;
  duplicados: number;
  errores: string[];
}
