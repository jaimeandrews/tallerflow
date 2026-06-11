"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ROL_LABELS } from "@/lib/utils/constants";
import { ConnectionBadge } from "@/components/marcaje/ConnectionBadge";
import type { RolUsuario } from "@/generated/prisma";

interface TecnicoHeaderProps {
  nombre: string;
  apellido: string;
  iniciales: string;
  rol: RolUsuario;
  color: string;
}

export default function TecnicoHeader({
  nombre,
  apellido,
  iniciales,
  rol,
  color,
}: TecnicoHeaderProps) {
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between flex-shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#00AEEF] flex items-center justify-center font-black text-xs text-white">
            T
          </div>
          <span className="font-bold text-slate-800 text-sm">TallerFlow</span>
        </div>
        <ConnectionBadge />
      </div>

      <div className="flex items-center gap-3">
        <Avatar className="w-8 h-8">
          <AvatarFallback
            className="text-white text-xs font-bold"
            style={{ backgroundColor: color }}
          >
            {iniciales}
          </AvatarFallback>
        </Avatar>
        <div className="leading-none text-right hidden sm:block">
          <p className="text-sm font-semibold text-slate-800">
            {nombre} {apellido}
          </p>
          <p className="text-xs text-slate-500">{ROL_LABELS[rol]}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-slate-500 hover:text-slate-700"
        >
          <LogOut size={16} />
        </Button>
      </div>
    </header>
  );
}
