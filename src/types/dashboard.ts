import type { EstadoOF, EstadoTecnico, PrioridadOF } from "@/generated/prisma";

export interface DashboardKpis {
  tecnicosActivos: number;
  tecnicosTotal: number;
  disponibilidad: number;
  deltaTecnicosAyer: number;
  ofEnProceso: number;
  deltaOfAyer: number;
  productividadHoy: number;
  metaProductividad: number;
  hhProductivas: number;
  hhNoProductivas: number;
  hhDisponibles: number;
  hhSobreUmbral: boolean;
  ofCriticas: number;
  tecnicosDetenidos: number;
}

export interface ProductividadPuntoHora {
  hora: string;
  productividad: number;
}

export interface ProductividadPuntoDia {
  fecha: string;
  productividad: number;
}

export interface ProductividadChartResponse {
  data: ProductividadPuntoHora[] | ProductividadPuntoDia[];
  pico: { hora: string; valor: number };
  promedio: number;
}

export interface TecnicoEnTaller {
  id: string;
  nombre: string;
  iniciales: string;
  color: string;
  estado: EstadoTecnico;
  actividad: string | null;
  ofActiva: string | null;
  inicio: string | null;
  duracionSegundos: number | null;
}

export interface TecnicosEnTallerResponse {
  tecnicos: TecnicoEnTaller[];
  total: number;
}

export type SlaStatus = "ok" | "warning" | "vencida";

export interface OFCritica {
  id: string;
  numero: string;
  nombre: string;
  proyecto: string;
  cliente: string;
  equipo: string;
  estado: {
    valor: EstadoOF;
    label: string;
    colorClass: string;
    dotColorClass: string;
  };
  prioridad: {
    valor: PrioridadOF;
    label: string;
  };
  critica: boolean;
  hhEstimadas: number;
  hhConsumidas: number;
  porcentajeHH: number;
  slaVencimiento: string | null;
  slaStatus: SlaStatus;
  slaDelta: string | null;
  tecnicos: Array<{ id: string; iniciales: string; color: string; nombre: string }>;
}

export interface OFCriticasResponse {
  ordenes: OFCritica[];
  total: number;
}

export type TimelineTipo = "inicio" | "fin" | "pausa";
export type TimelineTono = "blue" | "green" | "yellow" | "red" | "gray";

export interface TimelineEvento {
  id: string;
  hora: string;
  tecnico: string;
  iniciales: string;
  tipo: TimelineTipo;
  texto: string;
  tono: TimelineTono;
  horaInicio: string;
}

export interface TimelineResponse {
  eventos: TimelineEvento[];
}
