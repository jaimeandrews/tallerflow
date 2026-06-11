"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTimer } from "@/hooks/useTimer";
import { ESTADO_TECNICO_LABELS } from "@/lib/utils/constants";
import type { TecnicoEnTaller } from "@/types/dashboard";

interface Props {
  tecnico: TecnicoEnTaller | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SheetDetalleTecnico({ tecnico, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-6">
        <SheetHeader className="px-0">
          <SheetTitle>Detalle del técnico</SheetTitle>
        </SheetHeader>

        {tecnico ? <DetalleBody tecnico={tecnico} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function DetalleBody({ tecnico }: { tecnico: TecnicoEnTaller }) {
  const { formatted } = useTimer(tecnico.inicio);

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarFallback
            style={{ backgroundColor: tecnico.color }}
            className="text-sm font-semibold text-white"
          >
            {tecnico.iniciales}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-lg font-bold text-slate-800">{tecnico.nombre}</p>
          <p className="text-xs text-slate-400 font-mono">{tecnico.id}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Item label="Estado" value={ESTADO_TECNICO_LABELS[tecnico.estado]} />
        <Item label="Actividad" value={tecnico.actividad ?? "—"} />
        <Item label="OF activa" value={tecnico.ofActiva ?? "—"} />
        <Item label="Duración" value={tecnico.inicio ? formatted : "—"} />
      </dl>

      <p className="text-xs text-slate-400 border-t border-slate-100 pt-3">
        Vista de detalle ampliada — historial y métricas individuales se sumarán en próximas
        iteraciones.
      </p>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
    </div>
  );
}
