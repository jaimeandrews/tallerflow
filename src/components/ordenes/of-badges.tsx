import { AlertTriangle } from "lucide-react";
import type { EstadoOF, PrioridadOF } from "@/generated/prisma";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ESTADO_OF_COLORS,
  ESTADO_OF_DOT_COLORS,
  ESTADO_OF_LABELS,
  PRIORIDAD_OF_COLORS,
  PRIORIDAD_OF_LABELS,
} from "@/lib/utils/constants";

export function EstadoBadge({ estado, className }: { estado: EstadoOF; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent gap-1.5 font-medium", ESTADO_OF_COLORS[estado], className)}
    >
      <span className={cn("size-1.5 rounded-full", ESTADO_OF_DOT_COLORS[estado])} />
      {ESTADO_OF_LABELS[estado]}
    </Badge>
  );
}

export function PrioridadBadge({
  prioridad,
  className,
}: {
  prioridad: PrioridadOF;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", PRIORIDAD_OF_COLORS[prioridad], className)}
    >
      {prioridad === "CRITICA" && <AlertTriangle className="size-3" />}
      {PRIORIDAD_OF_LABELS[prioridad]}
    </Badge>
  );
}
