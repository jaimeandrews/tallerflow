import type { EstadoOF, PrioridadOF, RolUsuario, TipoMarcaje } from "@/generated/prisma";

export interface SucursalInfo {
  id: string;
  nombre: string;
  codigo: string;
}

export interface UsuarioMini {
  id: string;
  nombre: string;
  apellido?: string;
  iniciales: string;
  color: string;
  rol?: RolUsuario;
}

export interface AsignacionMini {
  id: string;
  hhPlanificadas: number;
  fechaAsignacion?: string;
  usuario: UsuarioMini;
}

export interface OrdenTrabajoListItem {
  id: string;
  numero: string;
  proyecto: string;
  nombre: string;
  cliente: string;
  equipo: string;
  estado: EstadoOF;
  prioridad: PrioridadOF;
  sucursalId: string;
  hhEstimadas: number;
  hhConsumidas: number;
  slaVencimiento: string | null;
  critica: boolean;
  tecnicosRequeridos: number;
  createdAt: string;
  updatedAt: string;
  sucursal: SucursalInfo;
  asignaciones: AsignacionMini[];
  _count: { marcajes: number };
}

export interface MarcajeMini {
  id: string;
  tipo: TipoMarcaje;
  horaInicio: string;
  horaFin: string | null;
  duracionMinutos: number | null;
  notas: string | null;
  usuario: UsuarioMini;
  actividad: {
    id: string;
    nombre: string;
    color: string;
    icono: string | null;
    productiva: boolean;
  };
}

export interface OrdenTrabajoDetalle extends OrdenTrabajoListItem {
  marcajes: MarcajeMini[];
}

export interface ConfiguracionSLAItem {
  id: string;
  nombre: string;
  descripcion: string | null;
  condicion: string;
  umbralMinutos: number;
  nivelAlerta: string;
}

export interface HistorialEntry {
  id: string;
  accion: string;
  datosAnteriores: string | null;
  datosNuevos: string | null;
  createdAt: string;
  ip: string | null;
  usuario: {
    id: string;
    nombre: string;
    apellido: string;
    iniciales: string;
    color: string;
  } | null;
}

export interface DetalleOrdenResponse {
  ordenTrabajo: OrdenTrabajoDetalle;
  configuracionSla: ConfiguracionSLAItem[];
  hhPorTecnico: Record<string, number>;
  hhProductivas: number;
  hhNoProductivas: number;
}

export interface HistorialResponse {
  historial: HistorialEntry[];
}

export interface ListadoOrdenesResponse {
  data: OrdenTrabajoListItem[];
  total: number;
  pagina: number;
  totalPaginas: number;
  porPagina: number;
}

export interface StatsOrdenes {
  pendientes: number;
  enProceso: number;
  pausadas: number;
  esperaRepuesto: number;
  finalizadas: number;
  criticas: number;
  total: number;
}

export interface StatsOrdenesResponse {
  stats: StatsOrdenes;
}

export type OrdenarOFPor =
  | "numero"
  | "prioridad"
  | "estado"
  | "hhConsumidas"
  | "slaVencimiento"
  | "createdAt";

export interface FiltrosOrdenes {
  estado?: EstadoOF;
  prioridad?: PrioridadOF;
  sucursalId?: string;
  tecnicoId?: string;
  busqueda?: string;
  pagina: number;
  porPagina: number;
  ordenarPor: OrdenarOFPor;
  direccion: "asc" | "desc";
}

export interface CrearOFPayload {
  numero: string;
  proyecto: string;
  nombre: string;
  cliente: string;
  equipo: string;
  sucursalId: string;
  hhEstimadas: number;
  prioridad: PrioridadOF;
  tecnicosRequeridos?: number;
  slaVencimiento?: string;
  critica?: boolean;
}

export type ActualizarOFPayload = Partial<CrearOFPayload> & {
  estado?: EstadoOF;
};
