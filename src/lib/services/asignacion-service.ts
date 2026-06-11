import type { EstadoOF, EstadoTecnico, PrioridadOF, RolUsuario } from "@/generated/prisma";
import { obtenerEstadoTecnico } from "./marcaje-service";

// ── Constants ──────────────────────────────────────────────────────────────

export const HH_CAPACIDAD_DIARIA = 8;

export const ROLES_GESTION_ASIGNACION: RolUsuario[] = ["ADMIN", "JEFE_TALLER", "COORDINADOR"];

export function puedeGestionarAsignacion(rol: RolUsuario): boolean {
  return ROLES_GESTION_ASIGNACION.includes(rol);
}

// ── Types ──────────────────────────────────────────────────────────────────

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
  asignados: Array<{
    asignacionId: string;
    hhPlanificadas: number;
    usuario: {
      id: string;
      nombre: string;
      apellido: string;
      iniciales: string;
      color: string;
    };
  }>;
  slots: SlotsOF;
  conflictos: ConflictoAsignacion[];
}

// ── Business logic ─────────────────────────────────────────────────────────

export function calcularCarga(hhAsignadas: number): CargaTecnico {
  const porcentaje =
    HH_CAPACIDAD_DIARIA > 0 ? Math.round((hhAsignadas / HH_CAPACIDAD_DIARIA) * 100) : 0;
  return {
    hhAsignadas,
    hhCapacidad: HH_CAPACIDAD_DIARIA,
    porcentaje,
    sobreCarga: hhAsignadas > HH_CAPACIDAD_DIARIA,
  };
}

// Minimal marcaje shape for computing technician status
interface MarcajeMini {
  horaFin: Date | null;
  tipo: "INICIO" | "FIN" | "PAUSA" | "REANUDACION";
  actividad: { nombre: string; productiva: boolean };
}

export function estadoDesdeUltimoMarcaje(ultimo: MarcajeMini | null): EstadoTecnico {
  return obtenerEstadoTecnico(ultimo as Parameters<typeof obtenerEstadoTecnico>[0]);
}

// Calculates hhPlanificadas for a new assignment: hhEstimadas / tecnicosRequeridos
export function calcularHHPlanificadasSugeridas(
  hhEstimadas: number,
  tecnicosRequeridos: number
): number {
  if (tecnicosRequeridos <= 0) return hhEstimadas;
  return Math.round((hhEstimadas / tecnicosRequeridos) * 10) / 10;
}

export function detectarConflictos(params: {
  of: {
    tecnicosRequeridos: number;
    slaVencimiento: Date | null;
    estado: EstadoOF;
  };
  asignadosCount: number;
  hhPorTecnico: number[];
}): ConflictoAsignacion[] {
  const { of, asignadosCount, hhPorTecnico } = params;
  const conflictos: ConflictoAsignacion[] = [];
  const faltantes = Math.max(0, of.tecnicosRequeridos - asignadosCount);

  if (faltantes > 0) {
    conflictos.push({
      tipo: "sin_staffing",
      mensaje: `Falt${faltantes === 1 ? "a" : "an"} ${faltantes} técnico${faltantes === 1 ? "" : "s"}`,
      nivel: of.estado === "EN_PROCESO" ? "error" : "warning",
    });
  }

  if (of.slaVencimiento && of.estado !== "FINALIZADA") {
    const ahora = new Date();
    const vencimiento = new Date(of.slaVencimiento);
    const msRestantes = vencimiento.getTime() - ahora.getTime();
    if (msRestantes < 0) {
      conflictos.push({
        tipo: "sobre_sla",
        mensaje: "SLA vencido",
        nivel: "error",
      });
    } else if (msRestantes < 24 * 60 * 60 * 1000) {
      conflictos.push({
        tipo: "sobre_sla",
        mensaje: "SLA vence en menos de 24h",
        nivel: "warning",
      });
    }
  }

  for (const hh of hhPorTecnico) {
    if (hh > HH_CAPACIDAD_DIARIA) {
      conflictos.push({
        tipo: "tecnico_sobrecargado",
        mensaje: `Un técnico supera las ${HH_CAPACIDAD_DIARIA} HH asignadas`,
        nivel: "warning",
      });
      break;
    }
  }

  return conflictos;
}

// Warn messages returned by mutations
export interface MutationWarning {
  codigo: string;
  mensaje: string;
}

export function warningsSobreCapacidad(hhAsignadasTrasOperacion: number): MutationWarning | null {
  if (hhAsignadasTrasOperacion > HH_CAPACIDAD_DIARIA) {
    return {
      codigo: "sobre_capacidad",
      mensaje: `El técnico tendrá ${hhAsignadasTrasOperacion.toFixed(1)} HH asignadas, superando la capacidad de ${HH_CAPACIDAD_DIARIA} HH`,
    };
  }
  return null;
}

export function warningExcedeTecnicos(
  asignadosTras: number,
  requeridos: number
): MutationWarning | null {
  if (asignadosTras > requeridos) {
    return {
      codigo: "excede_tecnicos_requeridos",
      mensaje: `La OF tiene ${asignadosTras} técnicos asignados (requeridos: ${requeridos})`,
    };
  }
  return null;
}

export function warningSinTecnicos(
  asignadosTras: number,
  estado: EstadoOF
): MutationWarning | null {
  if (asignadosTras === 0 && estado !== "FINALIZADA") {
    return {
      codigo: "sin_tecnicos",
      mensaje: "La OF quedó sin técnicos asignados",
    };
  }
  return null;
}

// Sucursal filter: non-ADMIN users only see their own sucursal
export function sucursalWhereFromUser(
  rol: RolUsuario,
  userSucursalId: string,
  querySucursalId?: string
): string {
  if (rol === "ADMIN" && querySucursalId) return querySucursalId;
  if (rol !== "ADMIN") return userSucursalId;
  return userSucursalId; // ADMIN sin filtro → usa la suya por defecto, pueden pasar otra
}
