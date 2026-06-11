import type { RolUsuario } from "@/generated/prisma";

// ── Paleta de colores para asignación aleatoria ───────────────────────────

export const COLORES_PALETA = [
  "#006FA0",
  "#0090CC",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#10B981",
  "#84CC16",
  "#06B6D4",
  "#A855F7",
  "#F43F5E",
];

export function colorAleatorio(): string {
  return COLORES_PALETA[Math.floor(Math.random() * COLORES_PALETA.length)];
}

// ── Iniciales ─────────────────────────────────────────────────────────────

export function generarIniciales(nombre: string, apellido: string): string {
  const n = nombre.trim().charAt(0).toUpperCase();
  const a = apellido.trim().charAt(0).toUpperCase();
  return `${n}${a}`;
}

// ── Permisos ──────────────────────────────────────────────────────────────

const ROLES_GESTION_CONFIG: RolUsuario[] = ["ADMIN", "JEFE_TALLER"];

export function puedeGestionarConfigUsuarios(rol: RolUsuario): boolean {
  return ROLES_GESTION_CONFIG.includes(rol);
}

/** ADMIN puede crear cualquier rol; JEFE_TALLER solo TECNICO y COORDINADOR. */
export function puedeCrearConRol(creadorRol: RolUsuario, nuevoRol: RolUsuario): boolean {
  if (creadorRol === "ADMIN") return true;
  if (creadorRol === "JEFE_TALLER") {
    return nuevoRol === "TECNICO" || nuevoRol === "COORDINADOR";
  }
  return false;
}

/** Filtro de sucursal para queries de usuarios. */
export function sucursalFiltroUsuarios(
  rol: RolUsuario,
  sucursalId: string,
  querySucursalId?: string | null
): string | undefined {
  if (rol === "ADMIN") return querySucursalId ?? undefined;
  return sucursalId; // JEFE_TALLER siempre ve solo la suya
}
