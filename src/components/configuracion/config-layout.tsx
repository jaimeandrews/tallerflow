"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cn } from "@/lib/utils";
import type { RolUsuario } from "@/generated/prisma";
import { Building2, Clock, Users, Star, ListChecks, ShieldAlert, ScrollText } from "lucide-react";
import { SeccionUsuarios } from "./seccion-usuarios";
import { SeccionSucursales } from "./seccion-sucursales";
import { SeccionActividades } from "./seccion-actividades";
import { SeccionTurnos } from "./seccion-turnos";
import { SeccionSLA } from "./seccion-sla";
import { SeccionEspecialidades } from "./seccion-especialidades";
import { SeccionAuditoria } from "./seccion-auditoria";

type Seccion =
  | "sucursales"
  | "turnos"
  | "usuarios"
  | "especialidades"
  | "actividades"
  | "sla"
  | "auditoria";

interface NavItem {
  id: Seccion;
  label: string;
  icon: React.ElementType;
  roles: RolUsuario[];
}

const GRUPOS: { label: string; items: NavItem[] }[] = [
  {
    label: "General",
    items: [
      { id: "sucursales", label: "Sucursales", icon: Building2, roles: ["ADMIN"] },
      { id: "turnos", label: "Turnos", icon: Clock, roles: ["ADMIN", "JEFE_TALLER"] },
    ],
  },
  {
    label: "Personas",
    items: [
      { id: "usuarios", label: "Usuarios", icon: Users, roles: ["ADMIN", "JEFE_TALLER"] },
      {
        id: "especialidades",
        label: "Especialidades",
        icon: Star,
        roles: ["ADMIN", "JEFE_TALLER"],
      },
    ],
  },
  {
    label: "Taller",
    items: [
      {
        id: "actividades",
        label: "Actividades",
        icon: ListChecks,
        roles: ["ADMIN", "JEFE_TALLER"],
      },
      { id: "sla", label: "Reglas SLA", icon: ShieldAlert, roles: ["ADMIN", "JEFE_TALLER"] },
    ],
  },
  {
    label: "Sistema",
    items: [
      {
        id: "auditoria",
        label: "Auditoría",
        icon: ScrollText,
        roles: ["ADMIN", "CONTROL_GESTION"],
      },
    ],
  },
];

interface Props {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
  userId: string;
}

function ConfigLayoutInner({ rol, sucursalId, sucursales, userId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const allItems = GRUPOS.flatMap((g) => g.items).filter((i) => i.roles.includes(rol));
  const raw = searchParams.get("seccion") as Seccion | null;
  const seccion: Seccion =
    raw && allItems.some((i) => i.id === raw) ? raw : (allItems[0]?.id ?? "usuarios");

  const setSeccion = (s: Seccion) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("seccion", s);
    router.push(`?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configuración</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gestión de usuarios, sucursales, turnos, actividades y reglas del sistema
        </p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sidebar */}
        <aside className="w-[220px] flex-shrink-0 bg-white border rounded-lg p-3 space-y-4 sticky top-6">
          {GRUPOS.map((grupo) => {
            const visibles = grupo.items.filter((i) => i.roles.includes(rol));
            if (visibles.length === 0) return null;
            return (
              <div key={grupo.label}>
                <p className="px-2 mb-1 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {grupo.label}
                </p>
                <div className="space-y-0.5">
                  {visibles.map((item) => {
                    const Icon = item.icon;
                    const active = seccion === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSeccion(item.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors",
                          active
                            ? "bg-[#006FA0] text-white font-medium"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </aside>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {seccion === "usuarios" && (
            <SeccionUsuarios
              rol={rol}
              sucursalId={sucursalId}
              sucursales={sucursales}
              userId={userId}
            />
          )}
          {seccion === "sucursales" && <SeccionSucursales />}
          {seccion === "actividades" && (
            <SeccionActividades rol={rol} sucursalId={sucursalId} sucursales={sucursales} />
          )}
          {seccion === "turnos" && (
            <SeccionTurnos rol={rol} sucursalId={sucursalId} sucursales={sucursales} />
          )}
          {seccion === "sla" && (
            <SeccionSLA rol={rol} sucursalId={sucursalId} sucursales={sucursales} />
          )}
          {seccion === "especialidades" && <SeccionEspecialidades />}
          {seccion === "auditoria" && <SeccionAuditoria rol={rol} sucursales={sucursales} />}
        </div>
      </div>
    </div>
  );
}

export function ConfigLayout(props: Props) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-slate-100" />}>
      <ConfigLayoutInner {...props} />
    </Suspense>
  );
}
