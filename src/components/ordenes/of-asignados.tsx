import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import type { AsignacionMini } from "@/types/ordenes";

interface AsignadosProps {
  asignaciones: AsignacionMini[];
  tecnicosRequeridos: number;
  max?: number;
}

export function OFAsignados({ asignaciones, tecnicosRequeridos, max = 3 }: AsignadosProps) {
  if (asignaciones.length === 0) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs text-slate-400">
        <Users className="size-3.5" />
        <span>0 / {tecnicosRequeridos}</span>
      </div>
    );
  }

  const shown = asignaciones.slice(0, max);
  const extra = asignaciones.length - shown.length;

  return (
    <div className="flex items-center gap-2">
      <AvatarGroup>
        {shown.map((a) => (
          <Avatar key={a.id} size="sm">
            <AvatarFallback
              style={{ backgroundColor: a.usuario.color }}
              className="text-white text-[10px] font-semibold"
            >
              {a.usuario.iniciales}
            </AvatarFallback>
          </Avatar>
        ))}
        {extra > 0 && <AvatarGroupCount>+{extra}</AvatarGroupCount>}
      </AvatarGroup>
      <span className="text-xs text-slate-500">
        {asignaciones.length} / {tecnicosRequeridos}
      </span>
    </div>
  );
}
