"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Building2, ExternalLink, LogOut, Moon, Settings, Sun, User } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTimeSeconds } from "@/lib/utils/formatters";
import { useSocket } from "@/hooks/useSocket";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { ROL_LABELS } from "@/lib/utils/constants";
import { canAccess } from "@/lib/auth/permissions";
import { GlobalSearch } from "./global-search";
import type { RolUsuario } from "@/generated/prisma";

// ── Types ──────────────────────────────────────────────────────────────────────

interface AlertaItem {
  id: string;
  titulo: string;
  descripcion: string;
  nivel: "critico" | "warning" | "info";
  createdAt: string;
}

interface TopbarProps {
  breadcrumb: string[];
  user: {
    nombre: string;
    apellido: string;
    email?: string;
    iniciales: string;
    rol: RolUsuario;
    color: string;
    sucursalNombre?: string;
  };
}

// ── Alert level config ─────────────────────────────────────────────────────────

const NIVEL_CONFIG = {
  critico: {
    dot: "bg-red-500",
    label: "Crítica",
    labelClass: "text-red-600 bg-red-50 border-red-200",
  },
  warning: {
    dot: "bg-amber-400",
    label: "Advertencia",
    labelClass: "text-amber-700 bg-amber-50 border-amber-200",
  },
  info: {
    dot: "bg-blue-400",
    label: "Info",
    labelClass: "text-blue-700 bg-blue-50 border-blue-200",
  },
} as const;

function formatRelativo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "hace un momento";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function Topbar({ breadcrumb, user }: TopbarProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [alertas, setAlertas] = useState<AlertaItem[]>([]);
  const [signingOut, setSigningOut] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clock
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // WebSocket
  const { socket, isConnected } = useSocket();
  const showWsDot = socket !== null;

  // Theme
  const { isDark, toggle: toggleTheme } = useTheme();

  // Fetch active alerts
  const fetchAlertas = useCallback(async () => {
    try {
      const res = await fetch("/api/centro-control/alertas-activas?limite=10");
      if (!res.ok) return;
      const data = (await res.json()) as { alertas: AlertaItem[] };
      setAlertas(data.alertas ?? []);
    } catch {
      // silenciar — el badge se mantiene en el valor anterior
    }
  }, []);

  useEffect(() => {
    void fetchAlertas();
    intervalRef.current = setInterval(() => void fetchAlertas(), 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchAlertas]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => void fetchAlertas();
    socket.on("alerta:nueva", refresh);
    socket.on("alerta:resuelta", refresh);
    return () => {
      socket.off("alerta:nueva", refresh);
      socket.off("alerta:resuelta", refresh);
    };
  }, [socket, fetchAlertas]);

  const criticas = alertas.filter((a) => a.nivel === "critico").length;
  const count = alertas.length;
  const badgeTone = criticas > 0 ? "bg-red-500" : count > 0 ? "bg-amber-500" : null;

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ callbackUrl: "/login" });
  }

  const puedeVerConfig = canAccess(user.rol, "configuracion");

  return (
    <header
      data-tallerflow-topbar
      className="h-16 flex items-center justify-between px-4 lg:px-6 border-b gap-4 bg-[var(--card)] border-[var(--border)]"
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 min-w-0 ml-10 lg:ml-0">
        {breadcrumb.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2 text-sm min-w-0">
            {i > 0 && <span className="text-slate-300">/</span>}
            <span
              className={
                i === breadcrumb.length - 1
                  ? "font-semibold text-[var(--foreground)] truncate"
                  : "text-[var(--muted-foreground)] truncate"
              }
            >
              {crumb}
            </span>
          </span>
        ))}
      </div>

      {/* Global search */}
      <GlobalSearch />

      {/* Right side */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Live clock + WS indicator */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Badge
            variant="outline"
            className="gap-1.5 border-green-200 bg-green-50 text-green-700 font-mono text-xs"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            EN VIVO · {now ? formatTimeSeconds(now) : "--:--:--"}
          </Badge>

          {showWsDot && (
            <span
              title={
                isConnected
                  ? "WebSocket conectado — actualizaciones en tiempo real"
                  : "WebSocket desconectado — usando polling"
              }
              className={cn(
                "inline-block h-2 w-2 rounded-full transition-colors",
                isConnected ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" : "bg-red-500"
              )}
              aria-label={isConnected ? "Conectado" : "Desconectado"}
            />
          )}
        </div>

        {/* Dark mode toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={toggleTheme}
          aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          title={isDark ? "Modo claro" : "Modo oscuro"}
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-500" />
          )}
        </Button>

        {/* Notification bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              aria-label={
                count === 0
                  ? "Sin alertas activas"
                  : `${count} alerta${count !== 1 ? "s" : ""} activa${count !== 1 ? "s" : ""}`
              }
            >
              <Bell
                className={cn(
                  "h-4 w-4 transition-colors",
                  count > 0 ? "text-slate-700" : "text-slate-400"
                )}
              />
              {count > 0 && badgeTone && (
                <span
                  className={cn(
                    "absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full text-white text-[10px] flex items-center justify-center font-bold",
                    badgeTone
                  )}
                >
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <DropdownMenuLabel className="p-0 font-semibold text-slate-800">
                Alertas activas
              </DropdownMenuLabel>
              {count > 0 && <span className="text-xs font-mono text-slate-400">{count}</span>}
            </div>

            <div className="max-h-[360px] overflow-y-auto">
              {alertas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2 px-4">
                  <Bell className="h-8 w-8 text-slate-200" />
                  <p className="text-sm text-slate-400">Sin alertas activas</p>
                  <p className="text-xs text-slate-300">El sistema está operando con normalidad</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {alertas.map((alerta) => {
                    const cfg = NIVEL_CONFIG[alerta.nivel];
                    return (
                      <li key={alerta.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-start gap-3">
                          <span className={cn("mt-1.5 h-2 w-2 rounded-full shrink-0", cfg.dot)} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium text-slate-800 leading-tight truncate">
                                {alerta.titulo}
                              </p>
                              <span
                                className={cn(
                                  "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border",
                                  cfg.labelClass
                                )}
                              >
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                              {alerta.descripcion}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1">
                              {formatRelativo(alerta.createdAt)}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <DropdownMenuSeparator />
            <div className="px-4 py-2.5">
              <Link
                href="/centro-control"
                className="flex items-center justify-center gap-1.5 text-xs font-medium text-[#006FA0] hover:text-[#005a82] transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver panel completo en Centro de control
              </Link>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── User avatar menu ─────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006FA0] focus-visible:ring-offset-2"
              aria-label="Menú de usuario"
            >
              <Avatar className="h-8 w-8 cursor-pointer hover:opacity-90 transition-opacity">
                <AvatarFallback
                  style={{ backgroundColor: user.color }}
                  className="text-white text-xs font-semibold"
                >
                  {user.iniciales}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64 p-0">
            {/* ── User card ───────────────────────────────────────────────── */}
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback
                    style={{ backgroundColor: user.color }}
                    className="text-white text-sm font-bold"
                  >
                    {user.iniciales}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
                    {user.nombre} {user.apellido}
                  </p>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{ROL_LABELS[user.rol]}</p>
                  {user.email && (
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{user.email}</p>
                  )}
                </div>
              </div>

              {user.sucursalNombre && (
                <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{user.sucursalNombre}</span>
                </div>
              )}
            </div>

            {/* ── Navigation links ────────────────────────────────────────── */}
            {puedeVerConfig && (
              <>
                <div className="p-1">
                  <DropdownMenuItem asChild>
                    <Link
                      href="/configuracion?seccion=usuarios"
                      className="flex items-center gap-2.5 px-2 py-2 text-sm cursor-pointer"
                    >
                      <User className="h-4 w-4 text-slate-400" />
                      Mi perfil
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/configuracion"
                      className="flex items-center gap-2.5 px-2 py-2 text-sm cursor-pointer"
                    >
                      <Settings className="h-4 w-4 text-slate-400" />
                      Configuración
                    </Link>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator />
              </>
            )}

            {/* ── Sign out ────────────────────────────────────────────────── */}
            <div className="p-1">
              <DropdownMenuItem
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex items-center gap-2.5 px-2 py-2 text-sm text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
