"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { io, type Socket } from "socket.io-client";
import {
  NAMESPACE_CONTROL,
  NAMESPACE_KIOSCO,
  SOCKET_PATH,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from "@/lib/socket/socket-events";

type SocketInstance = Socket<ServerToClientEvents, ClientToServerEvents>;
type Namespace = typeof NAMESPACE_CONTROL | typeof NAMESPACE_KIOSCO;

// ── Singleton cache por namespace ──────────────────────────────────────────
// Múltiples componentes en la misma página comparten una sola conexión.
// Las suscripciones (`on`/`off`) viven por componente y se limpian en unmount.
const socketCache = new Map<Namespace, SocketInstance>();

function namespaceForPathname(pathname: string | null): Namespace | null {
  if (!pathname) return null;
  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/centro-control" ||
    pathname.startsWith("/centro-control/")
  ) {
    return NAMESPACE_CONTROL;
  }
  if (
    pathname === "/marcaje" ||
    pathname.startsWith("/marcaje/") ||
    pathname === "/tecnico" ||
    pathname.startsWith("/tecnico/")
  ) {
    return NAMESPACE_KIOSCO;
  }
  return null;
}

function getOrCreateSocket(namespace: Namespace, token?: string | null): SocketInstance {
  const cached = socketCache.get(namespace);
  if (cached) return cached;

  const url = (typeof window !== "undefined" ? window.location.origin : "") + namespace;

  const socket: SocketInstance = io(url, {
    path: SOCKET_PATH,
    withCredentials: true, // envía cookies de NextAuth para supervisores
    auth: token ? { token } : undefined, // Bearer para kiosco/tablet
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000, // 1s inicial — luego sube 2s, 4s, 8s…
    reconnectionDelayMax: 30_000, // tope 30s (spec)
    randomizationFactor: 0.5,
    transports: ["websocket", "polling"], // websocket primero, polling fallback
  });

  socketCache.set(namespace, socket);
  return socket;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export interface UseSocketOptions {
  /** Bearer JWT para handshake. Si se omite, se confía en cookie de NextAuth. */
  token?: string | null;
  /** Forzar namespace específico — si no, se deriva del pathname. */
  namespace?: Namespace;
  /** Desactiva la conexión (p. ej. mientras se obtiene el token). */
  enabled?: boolean;
}

export interface UseSocketResult {
  isConnected: boolean;
  socket: SocketInstance | null;
  /** Suscribirse a un evento del servidor. Recordar llamar `off` en cleanup. */
  on: <K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]) => void;
  /** Desuscribirse. */
  off: <K extends keyof ServerToClientEvents>(event: K, handler: ServerToClientEvents[K]) => void;
  /** Emitir un evento al servidor. */
  emit: <K extends keyof ClientToServerEvents>(
    event: K,
    ...args: Parameters<ClientToServerEvents[K]>
  ) => void;
}

export function useSocket(options: UseSocketOptions = {}): UseSocketResult {
  const pathname = usePathname();
  const ns = options.namespace ?? namespaceForPathname(pathname);
  const enabled = options.enabled !== false && ns !== null;

  const [socket, setSocket] = useState<SocketInstance | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<SocketInstance | null>(null);

  useEffect(() => {
    if (!enabled || !ns) {
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const s = getOrCreateSocket(ns, options.token);
    socketRef.current = s;
    setSocket(s);
    setIsConnected(s.connected);

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    s.on("connect", handleConnect);
    s.on("disconnect", handleDisconnect);

    if (!s.connected) s.connect();

    return () => {
      // No desconectamos — la conexión se comparte entre componentes.
      // Solo limpiamos los listeners de connect/disconnect de este hook.
      s.off("connect", handleConnect);
      s.off("disconnect", handleDisconnect);
    };
  }, [enabled, ns, options.token]);

  const on = useCallback<UseSocketResult["on"]>((event, handler) => {
    const s = socketRef.current;
    if (!s) return;
    // El cast es necesario porque socket.io tiene problemas con genéricos
    // indirectos. En runtime es seguro: los call-sites están tipados.
    (s.on as unknown as (e: string, h: unknown) => void)(event, handler);
  }, []);

  const off = useCallback<UseSocketResult["off"]>((event, handler) => {
    const s = socketRef.current;
    if (!s) return;
    (s.off as unknown as (e: string, h: unknown) => void)(event, handler);
  }, []);

  const emit = useCallback<UseSocketResult["emit"]>((event, ...args) => {
    const s = socketRef.current;
    if (!s) return;
    (s.emit as unknown as (e: string, ...a: unknown[]) => void)(event, ...args);
  }, []);

  return { isConnected, socket, on, off, emit };
}
