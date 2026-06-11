/**
 * Definiciones tipadas de eventos Socket.io.
 *
 * Compartido entre cliente y servidor. Cualquier cambio aquí afecta a ambos lados
 * — mantener payloads compatibles entre versiones desplegadas.
 */

import type { EstadoOF, EstadoTecnico, TipoMarcaje } from "@/generated/prisma";
import type { DashboardKpis } from "@/types/dashboard";

// ── Namespaces ─────────────────────────────────────────────────────────────

export const NAMESPACE_CONTROL = "/control";
export const NAMESPACE_KIOSCO = "/kiosco";
export const SOCKET_PATH = "/api/socketio";

// ── Datos asociados a un socket autenticado ────────────────────────────────

export interface SocketUserData {
  id: string;
  nombre: string;
  iniciales: string;
  rol: string;
  sucursalId: string;
}

// ── Payloads compartidos ───────────────────────────────────────────────────

export interface MarcajePayload {
  id: string;
  tipo: TipoMarcaje;
  horaInicio: string;
  horaFin: string | null;
  duracionMinutos: number | null;
  sucursalId: string;
  actividad: {
    id: string;
    nombre: string;
    color: string;
    productiva: boolean;
  };
  ordenTrabajo: {
    id: string;
    numero: string;
    nombre: string;
  } | null;
}

export interface TecnicoMiniPayload {
  id: string;
  nombre: string;
  iniciales: string;
  color: string;
}

export interface AlertaPayload {
  id: string;
  titulo: string;
  descripcion: string;
  nivel: "info" | "warning" | "critico";
  sucursalId: string;
  configuracionSlaId: string | null;
  resuelta: boolean;
  datos: Record<string, unknown> | null;
  createdAt: string;
}

// ── Eventos Servidor → Cliente ─────────────────────────────────────────────

export interface ServerToClientEvents {
  "marcaje:nuevo": (payload: {
    marcaje: MarcajePayload;
    tecnico: TecnicoMiniPayload;
    of?: { id: string; numero: string } | null;
  }) => void;

  "marcaje:actualizado": (payload: { marcaje: MarcajePayload }) => void;

  "tecnico:estadoCambio": (payload: {
    tecnicoId: string;
    estadoAnterior: EstadoTecnico;
    estadoNuevo: EstadoTecnico;
    actividad?: { id: string; nombre: string; productiva: boolean } | null;
    of?: { id: string; numero: string } | null;
  }) => void;

  "of:estadoCambio": (payload: {
    ofId: string;
    ofNumero: string;
    estadoAnterior: EstadoOF;
    estadoNuevo: EstadoOF;
  }) => void;

  "alerta:nueva": (payload: { alerta: AlertaPayload }) => void;

  "alerta:resuelta": (payload: {
    alertaId: string;
    resueltaPor: { id: string; nombre: string };
  }) => void;

  "kpi:actualizado": (payload: { kpis: DashboardKpis }) => void;

  ping: (payload: { timestamp: number }) => void;
}

// ── Eventos Cliente → Servidor ─────────────────────────────────────────────

export interface ClientAck<T> {
  (response: { ok: true; data?: T } | { ok: false; error: string }): void;
}

export interface ClientToServerEvents {
  "alerta:resolver": (payload: { alertaId: string }, ack: ClientAck<{ alertaId: string }>) => void;

  "alerta:asignar": (
    payload: { alertaId: string; tecnicoId: string },
    ack: ClientAck<{ alertaId: string; tecnicoId: string }>
  ) => void;
}

// ── Eventos inter-servidor (reservado para escalado horizontal con adapter) ─

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {}

// ── Helpers de rooms ───────────────────────────────────────────────────────

export function roomSucursal(sucursalId: string): string {
  return `sucursal:${sucursalId}`;
}

export function roomTecnico(usuarioId: string): string {
  return `tecnico:${usuarioId}`;
}
