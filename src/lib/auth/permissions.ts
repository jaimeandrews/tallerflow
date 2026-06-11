import type { RolUsuario } from "@/generated/prisma";

export type AppRoute =
  | "dashboard"
  | "ordenes"
  | "asignacion"
  | "centro-control"
  | "tecnico"
  | "marcaje"
  | "reportes"
  | "configuracion";

const PERMISSIONS: Record<RolUsuario, AppRoute[]> = {
  ADMIN: [
    "dashboard",
    "ordenes",
    "asignacion",
    "centro-control",
    "tecnico",
    "marcaje",
    "reportes",
    "configuracion",
  ],
  GERENTE_SUCURSAL: ["dashboard", "reportes"],
  JEFE_TALLER: [
    "dashboard",
    "ordenes",
    "asignacion",
    "centro-control",
    "reportes",
    "configuracion",
  ],
  COORDINADOR: ["ordenes", "asignacion", "centro-control"],
  TECNICO: ["tecnico", "marcaje"],
  CONTROL_GESTION: ["dashboard", "reportes", "configuracion"],
};

export function canAccess(rol: RolUsuario, route: AppRoute): boolean {
  return PERMISSIONS[rol]?.includes(route) ?? false;
}

export function getAllowedRoutes(rol: RolUsuario): AppRoute[] {
  return PERMISSIONS[rol] ?? [];
}

export function getDefaultRoute(rol: RolUsuario): string {
  const routes = getAllowedRoutes(rol);
  if (routes.length === 0) return "/login";
  return `/${routes[0]}`;
}
