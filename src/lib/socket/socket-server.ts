/**
 * Servidor Socket.io integrado al servidor HTTP de Next.js.
 *
 * ── Decisión de integración ─────────────────────────────────────────────────
 *
 * Next.js 15/16 con App Router NO expone el servidor HTTP subyacente a los
 * Route Handlers, ni soporta WebSocket upgrades nativos en /api/* routes.
 *
 * Las opciones evaluadas fueron:
 *
 *  1. Route Handler con upgrade WebSocket → no soportado oficialmente en
 *     App Router. Implementaciones community (`req.socket.server` hack)
 *     son frágiles en App Router y rompen con HMR en dev.
 *  2. Servidor Socket.io separado en otro puerto → agrega complejidad
 *     operacional (CORS, puerto extra, deploy doble) sin beneficio claro.
 *  3. Custom server (server.ts) que envuelve next() y crea el HTTP server
 *     manualmente → patrón **oficialmente soportado** por Next.js, idéntico
 *     en dev y producción, integración limpia con Socket.io.
 *
 * Elegido: opción 3. La inicialización vive aquí; server.ts (root del proyecto)
 * crea el HttpServer, lo pasa a `initSocketServer()`, y luego al handler de
 * Next.js. Path montado: `/api/socketio` (mismo origen, sin CORS extra).
 *
 * ── Singleton ───────────────────────────────────────────────────────────────
 *
 * La instancia se guarda en globalThis para que los Route Handlers (que viven
 * en el mismo proceso) puedan emitir eventos vía `socket-emitter.ts`.
 */

import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer, type Namespace, type Socket } from "socket.io";
import { decode } from "@auth/core/jwt";
import {
  NAMESPACE_CONTROL,
  NAMESPACE_KIOSCO,
  SOCKET_PATH,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketUserData,
  roomSucursal,
  roomTecnico,
} from "./socket-events";

// Salt usado por NextAuth/auth.js para firmar la cookie de sesión.
// Reusamos exactamente el mismo string que api-auth.ts para que el decode
// reconozca tanto cookies de NextAuth como los JWT que emite /api/auth/pin.
const JWT_SALT = "authjs.session-token";
const HEARTBEAT_INTERVAL_MS = 15_000;

// Globalmente accesible para que los API Routes puedan emitir.
// En dev mode con HMR, el `var` ensures the same instance is reused
// after hot-reload (variables declared with `let` are recreated).
declare global {
   
  var __tallerflowSocketIO:
    | SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketUserData>
    | undefined;
   
  var __tallerflowSocketHeartbeat: NodeJS.Timeout | undefined;
}

export type TallerFlowSocketIOServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketUserData
>;

export type TallerFlowNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketUserData
>;

export type TallerFlowSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketUserData
>;

// ── Cookie parsing ─────────────────────────────────────────────────────────

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function extractToken(socket: TallerFlowSocket): string | null {
  // 1. Token explícito (kiosco/tablet via emit Bearer)
  const authToken = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
  if (typeof authToken === "string" && authToken.length > 0) return authToken;

  // 2. Cookie de NextAuth (web supervisores)
  const cookies = parseCookies(socket.handshake.headers.cookie);
  return cookies["authjs.session-token"] ?? cookies["__Secure-authjs.session-token"] ?? null;
}

async function decodeToken(token: string): Promise<SocketUserData | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error("[socket] AUTH_SECRET no configurado");
    return null;
  }
  try {
    const decoded = await decode({ token, secret, salt: JWT_SALT });
    const d = decoded as Record<string, unknown> | null;
    if (!d?.id || !d?.sucursalId) return null;
    return {
      id: d.id as string,
      nombre: (d.nombre as string) ?? "",
      iniciales: (d.iniciales as string) ?? "",
      rol: (d.rol as string) ?? "",
      sucursalId: d.sucursalId as string,
    };
  } catch {
    return null;
  }
}

// ── Namespace setup ────────────────────────────────────────────────────────

interface NamespaceOptions {
  joinTecnicoRoom: boolean;
  label: string;
}

function configurarNamespace(ns: TallerFlowNamespace, options: NamespaceOptions) {
  // Auth middleware — bloquea handshake si no hay JWT válido.
  ns.use(async (socket, next) => {
    const token = extractToken(socket as TallerFlowSocket);
    if (!token) {
      return next(new Error("unauthorized: missing token"));
    }
    const user = await decodeToken(token);
    if (!user) {
      return next(new Error("unauthorized: invalid token"));
    }
    socket.data = user;
    next();
  });

  ns.on("connection", (socket) => {
    const user = socket.data;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    // Auto-join rooms
    socket.join(roomSucursal(user.sucursalId));
    if (options.joinTecnicoRoom) {
      socket.join(roomTecnico(user.id));
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[socket${options.label}] conectado user=${user.id} sucursal=${user.sucursalId} socket=${socket.id}`
      );
    }

    // ── Handlers cliente → servidor ────────────────────────────────────────

    socket.on("alerta:resolver", async (payload, ack) => {
      try {
        // Import dinámico para evitar ciclo con alerta-service → socket-emitter.
        const { resolverAlerta } = await import("@/lib/services/alerta-service");
        const result = await resolverAlerta({
          alertaId: payload.alertaId,
          usuarioId: user.id,
          usuarioNombre: user.nombre,
        });
        if (result.ok) {
          ack?.({ ok: true, data: { alertaId: payload.alertaId } });
        } else {
          ack?.({ ok: false, error: result.error ?? "No se pudo resolver" });
        }
      } catch (err) {
        ack?.({
          ok: false,
          error: err instanceof Error ? err.message : "Error interno",
        });
      }
    });

    socket.on("alerta:asignar", (_payload, ack) => {
      ack?.({ ok: false, error: "alerta:asignar no implementado todavía" });
    });

    socket.on("disconnect", (reason) => {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[socket${options.label}] desconectado user=${user.id} socket=${socket.id} motivo=${reason}`
        );
      }
    });
  });
}

// ── Heartbeat ──────────────────────────────────────────────────────────────

function iniciarHeartbeat(io: TallerFlowSocketIOServer) {
  if (globalThis.__tallerflowSocketHeartbeat) {
    clearInterval(globalThis.__tallerflowSocketHeartbeat);
  }
  globalThis.__tallerflowSocketHeartbeat = setInterval(() => {
    const payload = { timestamp: Date.now() };
    io.of(NAMESPACE_CONTROL).emit("ping", payload);
    io.of(NAMESPACE_KIOSCO).emit("ping", payload);
  }, HEARTBEAT_INTERVAL_MS);
}

// ── Entry point ────────────────────────────────────────────────────────────

export function initSocketServer(httpServer: HttpServer): TallerFlowSocketIOServer {
  if (globalThis.__tallerflowSocketIO) {
    return globalThis.__tallerflowSocketIO;
  }

  const io: TallerFlowSocketIOServer = new SocketIOServer(httpServer, {
    path: SOCKET_PATH,
    cors: {
      // Mismo origen — el cliente vive en la misma app Next.js.
      // Si llegamos a desplegar el kiosco como app separada, ampliar aquí.
      origin: true,
      credentials: true,
    },
    // Mantén la conexión más viva en redes flaky (taller con WiFi débil).
    pingTimeout: 30_000,
    pingInterval: 25_000,
  });

  configurarNamespace(io.of(NAMESPACE_CONTROL), {
    joinTecnicoRoom: false,
    label: NAMESPACE_CONTROL,
  });

  configurarNamespace(io.of(NAMESPACE_KIOSCO), {
    joinTecnicoRoom: true,
    label: NAMESPACE_KIOSCO,
  });

  iniciarHeartbeat(io);

  globalThis.__tallerflowSocketIO = io;
  console.log(`[socket] Socket.io listo en path ${SOCKET_PATH}`);
  return io;
}

export function getSocketIO(): TallerFlowSocketIOServer | null {
  return globalThis.__tallerflowSocketIO ?? null;
}
