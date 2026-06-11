import type { TipoReporte } from "./reportes";

export type PeriodoRapido = "hoy" | "semana" | "mes" | "trimestre" | "personalizado";

export interface FiltroReporte {
  periodo: PeriodoRapido;
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  sucursalId: string; // "" = sin filtro (admin viendo todas)
  tipo: TipoReporte;
}

export interface SucursalOption {
  id: string;
  nombre: string;
  codigo: string;
}
