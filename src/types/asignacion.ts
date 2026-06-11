import type { EstadoOF, EstadoTecnico, PrioridadOF, RolUsuario } from "@/generated/prisma";

export type { EstadoOF, EstadoTecnico, PrioridadOF };

export type FiltroTecnico = "todos" | "disponibles" | "ocupados";

export interface CargaTecnico {
  hhAsignadas: number;
  hhCapacidad: number;
  porcentaje: number;
  sobreCarga: boolean;
}

export interface OFAsignadaResumen {
  ofId: string;
  ofNumero: string;
  ofNombre: string;
  ofEstado: EstadoOF;
  ofPrioridad: PrioridadOF;
  hhPlanificadas: number;
}

export interface TecnicoConCarga {
  id: string;
  nombre: string;
  apellido: string;
  iniciales: string;
  color: string;
  rol: RolUsuario;
  especialidades: string[];
  estadoActual: EstadoTecnico;
  carga: CargaTecnico;
  ofAsignadas: OFAsignadaResumen[];
}

export interface ConflictoAsignacion {
  tipo: "sin_staffing" | "sobre_sla" | "tecnico_sobrecargado";
  mensaje: string;
  nivel: "error" | "warning";
}

export interface SlotsOF {
  requeridos: number;
  asignados: number;
  faltantes: number;
}

export interface AsignadoEnOF {
  asignacionId: string;
  hhPlanificadas: number;
  usuario: {
    id: string;
    nombre: string;
    apellido: string;
    iniciales: string;
    color: string;
  };
}

export interface OFAsignable {
  id: string;
  numero: string;
  nombre: string;
  proyecto: string;
  cliente: string;
  equipo: string;
  estado: EstadoOF;
  prioridad: PrioridadOF;
  hhEstimadas: number;
  hhConsumidas: number;
  slaVencimiento: string | null;
  critica: boolean;
  tecnicosRequeridos: number;
  sucursalId: string;
  sucursalNombre: string;
  createdAt: string;
  asignados: AsignadoEnOF[];
  slots: SlotsOF;
  conflictos: ConflictoAsignacion[];
}

export interface ResumenAsignacion {
  tecnicosAsignados: number;
  totalTecnicos: number;
  hhPlanificadas: number;
  hhDisponibles: number;
  utilizacion: number;
  ofSinAsignar: number;
  sobreCapacidad: number;
  totalOrdenes: number;
}

export interface MutationWarning {
  codigo: string;
  mensaje: string;
}

export interface AsignarResult {
  ok: boolean;
  error?: string;
  warnings: MutationWarning[];
}

export interface PublicarPlanResumen {
  tecnicos: number;
  ordenes: number;
  hhTotal: number;
  conflictos: number;
  hhDisponibles: number;
}
