"use client";

import { useEffect } from "react";
import { useSocket } from "./useSocket";
import { requestNotificationPermission, showAlertaCritica } from "@/lib/notifications";
import type { AlertaPayload } from "@/lib/socket/socket-events";

/**
 * Suscribe el componente a notificaciones del navegador para alertas
 * críticas. Pide permiso una vez al montar (si el permiso está en "default")
 * y filtra eventos socket por `nivel === "critico"`.
 *
 * Usar en páginas que correspondan al namespace `/control`
 * (dashboard, centro-control).
 */
export function useAlertaNotifications() {
  const { socket } = useSocket();

  // Pedir permiso una vez al montar (sin bloquear).
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { alerta: AlertaPayload }) => {
      if (payload.alerta.nivel !== "critico") return;
      showAlertaCritica({
        id: payload.alerta.id,
        titulo: payload.alerta.titulo,
        descripcion: payload.alerta.descripcion,
      });
    };
    socket.on("alerta:nueva", handler);
    return () => {
      socket.off("alerta:nueva", handler);
    };
  }, [socket]);
}
