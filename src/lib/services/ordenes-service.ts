import type { EstadoOF, RolUsuario } from "@/generated/prisma";

export const ROLES_GESTION_OF: RolUsuario[] = ["ADMIN", "JEFE_TALLER", "COORDINADOR"];

export function puedeGestionarOF(rol: RolUsuario): boolean {
  return ROLES_GESTION_OF.includes(rol);
}

const TRANSICIONES: Record<EstadoOF, EstadoOF[]> = {
  PENDIENTE: ["EN_PROCESO", "PAUSADA"],
  EN_PROCESO: ["PAUSADA", "ESPERA_REPUESTO", "FINALIZADA"],
  PAUSADA: ["EN_PROCESO"],
  ESPERA_REPUESTO: ["EN_PROCESO", "PAUSADA"],
  FINALIZADA: [],
};

export interface TransicionResult {
  permitida: boolean;
  motivo?: string;
}

export function validarTransicionEstado(
  estadoActual: EstadoOF,
  estadoNuevo: EstadoOF,
  rol: RolUsuario
): TransicionResult {
  if (estadoActual === estadoNuevo) {
    return { permitida: false, motivo: "La OF ya está en ese estado" };
  }

  if (estadoActual === "FINALIZADA") {
    if (rol === "ADMIN") return { permitida: true };
    return {
      permitida: false,
      motivo: "Solo ADMIN puede reabrir una OF finalizada",
    };
  }

  const permitidas = TRANSICIONES[estadoActual];
  if (!permitidas.includes(estadoNuevo)) {
    return {
      permitida: false,
      motivo: `Transición ${estadoActual} → ${estadoNuevo} no permitida`,
    };
  }

  return { permitida: true };
}

export function aplicaFiltroSucursal(rol: RolUsuario): boolean {
  return rol !== "ADMIN";
}
