import type { EstadoOF, PrioridadOF, RolUsuario, EstadoTecnico } from "@/generated/prisma";

export const ESTADO_OF_LABELS: Record<EstadoOF, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  PAUSADA: "Pausada",
  ESPERA_REPUESTO: "Espera repuesto",
  FINALIZADA: "Finalizada",
};

export const ESTADO_OF_COLORS: Record<EstadoOF, string> = {
  PENDIENTE: "bg-slate-100 text-slate-700",
  EN_PROCESO: "bg-blue-100 text-blue-700",
  PAUSADA: "bg-yellow-100 text-yellow-700",
  ESPERA_REPUESTO: "bg-orange-100 text-orange-700",
  FINALIZADA: "bg-green-100 text-green-700",
};

export const ESTADO_OF_DOT_COLORS: Record<EstadoOF, string> = {
  PENDIENTE: "bg-slate-400",
  EN_PROCESO: "bg-blue-500",
  PAUSADA: "bg-yellow-500",
  ESPERA_REPUESTO: "bg-red-500",
  FINALIZADA: "bg-green-500",
};

export const ESTADO_OF_PILL_COLORS: Record<EstadoOF, { base: string; active: string }> = {
  PENDIENTE: {
    base: "border-slate-200 bg-slate-50 text-slate-700",
    active: "border-slate-500 bg-slate-100 text-slate-800",
  },
  EN_PROCESO: {
    base: "border-blue-200 bg-blue-50 text-blue-700",
    active: "border-blue-500 bg-blue-100 text-blue-800",
  },
  PAUSADA: {
    base: "border-yellow-200 bg-yellow-50 text-yellow-700",
    active: "border-yellow-500 bg-yellow-100 text-yellow-800",
  },
  ESPERA_REPUESTO: {
    base: "border-red-200 bg-red-50 text-red-700",
    active: "border-red-500 bg-red-100 text-red-800",
  },
  FINALIZADA: {
    base: "border-green-200 bg-green-50 text-green-700",
    active: "border-green-500 bg-green-100 text-green-800",
  },
};

export const ESTADO_OF_ORDER: EstadoOF[] = [
  "PENDIENTE",
  "EN_PROCESO",
  "PAUSADA",
  "ESPERA_REPUESTO",
  "FINALIZADA",
];

export const PRIORIDAD_OF_ORDER: PrioridadOF[] = ["CRITICA", "ALTA", "MEDIA", "BAJA"];

export const PRIORIDAD_OF_LABELS: Record<PrioridadOF, string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

export const PRIORIDAD_OF_COLORS: Record<PrioridadOF, string> = {
  CRITICA: "bg-red-100 text-red-700",
  ALTA: "bg-orange-100 text-orange-700",
  MEDIA: "bg-yellow-100 text-yellow-700",
  BAJA: "bg-slate-100 text-slate-700",
};

export const ROL_LABELS: Record<RolUsuario, string> = {
  ADMIN: "Administrador",
  GERENTE_SUCURSAL: "Gerente de Sucursal",
  JEFE_TALLER: "Jefe de Taller",
  COORDINADOR: "Coordinador",
  TECNICO: "Técnico",
  CONTROL_GESTION: "Control de Gestión",
};

export const ESTADO_TECNICO_LABELS: Record<EstadoTecnico, string> = {
  TRABAJANDO: "Trabajando",
  PAUSA: "En pausa",
  ALMUERZO: "Almuerzo",
  DETENIDO: "Detenido",
  DISPONIBLE: "Disponible",
};

export const ESTADO_TECNICO_COLORS: Record<EstadoTecnico, string> = {
  TRABAJANDO: "bg-green-500",
  PAUSA: "bg-yellow-400",
  ALMUERZO: "bg-blue-400",
  DETENIDO: "bg-red-500",
  DISPONIBLE: "bg-slate-400",
};

export const SUCURSALES_CODIGOS = ["ANT", "CAL", "COP", "SCL", "LAG", "PMC"] as const;

export const NAV_ITEMS = [
  {
    section: "Operaciones",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard" },
      { label: "Órdenes de trabajo", href: "/ordenes", icon: "clipboard-list" },
      { label: "Asignación", href: "/asignacion", icon: "user-check" },
      { label: "Centro de control", href: "/centro-control", icon: "monitor" },
    ],
  },
  {
    section: "Vistas de taller",
    items: [
      { label: "Vista técnico", href: "/tecnico", icon: "hard-hat" },
      { label: "Marcaje kiosco", href: "/marcaje", icon: "fingerprint" },
    ],
  },
  {
    section: "Gestión",
    items: [
      { label: "Reportes", href: "/reportes", icon: "bar-chart-2" },
      { label: "Configuración", href: "/configuracion", icon: "settings" },
    ],
  },
] as const;
