/**
 * Helpers para emitir eventos Socket.io desde los Route Handlers existentes.
 *
 * Los API endpoints (`/api/marcaje/iniciar`, `/api/ordenes/[id]/estado`, etc.)
 * pueden llamar a estas funciones para notificar a los clientes conectados.
 *
 * Si el servidor Socket.io no está inicializado (p. ej. test unitario, o el
 * Route Handler se ejecuta antes que el custom server arranque), las funciones
 * son no-op silenciosas — la lógica de negocio nunca falla por esto.
 */

import {
  NAMESPACE_CONTROL,
  NAMESPACE_KIOSCO,
  roomSucursal,
  roomTecnico,
  type ServerToClientEvents,
} from "./socket-events";
import { getSocketIO } from "./socket-server";

type EventName = keyof ServerToClientEvents;
type EventPayload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

// ── Emisores base ──────────────────────────────────────────────────────────

/** Emite un evento a TODOS los clientes (control + kiosco) de una sucursal. */
export function emitirASucursal<E extends EventName>(
  sucursalId: string,
  evento: E,
  datos: EventPayload<E>
): void {
  const io = getSocketIO();
  if (!io) return;
  const room = roomSucursal(sucursalId);
  // @ts-expect-error Socket.io's emit() typing has trouble with the generic
  // EventName indirection — runtime es válido y los call-sites son tipados.
  io.of(NAMESPACE_CONTROL).to(room).emit(evento, datos);
  // @ts-expect-error misma razón que arriba
  io.of(NAMESPACE_KIOSCO).to(room).emit(evento, datos);
}

/** Emite SOLO al técnico (su tablet/kiosco) en el namespace de kiosco. */
export function emitirATecnico<E extends EventName>(
  usuarioId: string,
  evento: E,
  datos: EventPayload<E>
): void {
  const io = getSocketIO();
  if (!io) return;
  // @ts-expect-error misma razón que arriba
  io.of(NAMESPACE_KIOSCO).to(roomTecnico(usuarioId)).emit(evento, datos);
}

/** Emite SOLO a los supervisores del centro de control de una sucursal. */
export function emitirAControl<E extends EventName>(
  sucursalId: string,
  evento: E,
  datos: EventPayload<E>
): void {
  const io = getSocketIO();
  if (!io) return;
  // @ts-expect-error misma razón que arriba
  io.of(NAMESPACE_CONTROL).to(roomSucursal(sucursalId)).emit(evento, datos);
}

// ── Conveniencia: eventos específicos del dominio ──────────────────────────
// Wrappers fuertemente tipados — preferidos en call-sites para evitar errores
// silenciosos en los nombres de evento.

export const socketEmit = {
  marcajeNuevo(sucursalId: string, payload: EventPayload<"marcaje:nuevo">) {
    emitirASucursal(sucursalId, "marcaje:nuevo", payload);
  },

  marcajeActualizado(sucursalId: string, payload: EventPayload<"marcaje:actualizado">) {
    emitirASucursal(sucursalId, "marcaje:actualizado", payload);
  },

  tecnicoEstadoCambio(sucursalId: string, payload: EventPayload<"tecnico:estadoCambio">) {
    emitirAControl(sucursalId, "tecnico:estadoCambio", payload);
  },

  ofEstadoCambio(sucursalId: string, payload: EventPayload<"of:estadoCambio">) {
    emitirASucursal(sucursalId, "of:estadoCambio", payload);
  },

  alertaNueva(sucursalId: string, payload: EventPayload<"alerta:nueva">) {
    emitirAControl(sucursalId, "alerta:nueva", payload);
  },

  alertaResuelta(sucursalId: string, payload: EventPayload<"alerta:resuelta">) {
    emitirAControl(sucursalId, "alerta:resuelta", payload);
  },

  kpiActualizado(sucursalId: string, payload: EventPayload<"kpi:actualizado">) {
    emitirAControl(sucursalId, "kpi:actualizado", payload);
  },
};
