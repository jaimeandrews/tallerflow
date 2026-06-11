"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  UserCheck,
  Monitor,
  HardHat,
  Fingerprint,
  BarChart2,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/generated/prisma";
import { ROL_LABELS } from "@/lib/utils/constants";
import { canAccess, type AppRoute } from "@/lib/auth/permissions";
import { useSucursalActiva } from "@/contexts/sucursal-context";

const ICON_MAP = {
  "layout-dashboard": LayoutDashboard,
  "clipboard-list": ClipboardList,
  "user-check": UserCheck,
  monitor: Monitor,
  "hard-hat": HardHat,
  fingerprint: Fingerprint,
  "bar-chart-2": BarChart2,
  settings: Settings,
} as const;

const NAV_SECTIONS = [
  {
    section: "Operaciones",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", route: "dashboard" },
      { label: "Órdenes de trabajo", href: "/ordenes", icon: "clipboard-list", route: "ordenes" },
      { label: "Asignación", href: "/asignacion", icon: "user-check", route: "asignacion" },
      {
        label: "Centro de control",
        href: "/centro-control",
        icon: "monitor",
        route: "centro-control",
      },
    ],
  },
  {
    section: "Vistas de taller",
    items: [
      { label: "Vista técnico", href: "/tecnico", icon: "hard-hat", route: "tecnico" },
      { label: "Marcaje kiosco", href: "/marcaje", icon: "fingerprint", route: "marcaje" },
    ],
  },
  {
    section: "Gestión",
    items: [
      { label: "Reportes", href: "/reportes", icon: "bar-chart-2", route: "reportes" },
      { label: "Configuración", href: "/configuracion", icon: "settings", route: "configuracion" },
    ],
  },
] as const;

interface SidebarProps {
  user: {
    nombre: string;
    apellido: string;
    iniciales: string;
    rol: RolUsuario;
    sucursalId: string;
    color: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const { sucursalActiva, sucursales, setSucursalActivaId } = useSucursalActiva();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // ESC key to close
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  // Body scroll lock when open on mobile
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Move focus to first nav link when sidebar opens
  useEffect(() => {
    if (mobileOpen) {
      // Small delay so the translate animation starts first
      const t = setTimeout(() => firstLinkRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [mobileOpen]);

  // ── Sidebar content (shared between desktop + mobile) ─────────────────────

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700">
        <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#006FA0] flex items-center justify-center text-white font-bold text-lg">
          T
        </div>
        <div className="overflow-hidden">
          <p className="font-semibold text-sm text-white leading-tight">TallerFlow</p>
          <p className="text-xs text-slate-400 leading-tight">Marcaje técnico</p>
        </div>
        {/* Close button — mobile only */}
        <button
          type="button"
          className="ml-auto lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Sucursal selector */}
      <div className="px-3 py-3 border-b border-slate-700">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between text-left h-auto py-2 px-3 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <div className="min-w-0">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Sucursal</p>
                <p className="text-sm font-medium truncate">{sucursalActiva.nombre}</p>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-slate-800 border-slate-700">
            {sucursales.map((s) => (
              <DropdownMenuItem
                key={s.id}
                className={cn(
                  "text-slate-300 hover:bg-slate-700 cursor-pointer",
                  s.id === sucursalActiva.id && "bg-slate-700 text-white"
                )}
                onClick={() => setSucursalActivaId(s.id)}
              >
                {s.nombre}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV_SECTIONS.map(({ section, items }, sectionIndex) => {
          const visibleItems = items.filter((item) => canAccess(user.rol, item.route as AppRoute));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section}>
              <p className="px-2 mb-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {section}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item, itemIndex) => {
                  const Icon = ICON_MAP[item.icon as keyof typeof ICON_MAP];
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const isFirst = sectionIndex === 0 && itemIndex === 0;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      ref={isFirst ? firstLinkRef : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-[#006FA0] text-white font-medium"
                          : "text-slate-400 hover:bg-slate-800 hover:text-white"
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <Separator className="bg-slate-700" />

      {/* User chip */}
      <div className="p-3">
        <div className="flex items-center gap-3 rounded-md px-2 py-2">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback
              style={{ backgroundColor: user.color }}
              className="text-white text-xs font-semibold"
            >
              {user.iniciales}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user.nombre} {user.apellido}
            </p>
            <p className="text-xs text-slate-400 truncate">{ROL_LABELS[user.rol]}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700 flex-shrink-0"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Cerrar sesión"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────────── */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:z-50">
        {sidebarContent}
      </aside>

      {/* ── Mobile hamburger button (shown in topbar area) ───────────────────
          Positioned inside the topbar height (h-16 = 64px) so it appears
          aligned with the topbar content on mobile. */}
      <button
        type="button"
        aria-label="Abrir menú"
        aria-expanded={mobileOpen}
        aria-controls="mobile-sidebar"
        onClick={() => setMobileOpen(true)}
        className={cn(
          "fixed top-0 left-0 z-50 lg:hidden",
          "h-16 w-14 flex items-center justify-center",
          "text-slate-600 hover:text-slate-900 transition-colors",
          mobileOpen && "invisible" // hide when sidebar is open (X is inside sidebar)
        )}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Overlay (fade in/out) ────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden",
          "transition-opacity duration-300",
          mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      />

      {/* ── Mobile sidebar (slide in from left) ─────────────────────────────── */}
      <aside
        id="mobile-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 lg:hidden",
          "transform transition-transform duration-300 ease-in-out",
          "shadow-2xl",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
