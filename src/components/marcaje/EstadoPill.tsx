import { cn } from "@/lib/utils";

export const ESTADO_CONFIG = {
  TRABAJANDO: { label: "Trabajando", color: "#2C8A4A" },
  PAUSA: { label: "En pausa", color: "#F4A91A" },
  ALMUERZO: { label: "Almuerzo", color: "#00AEEF" },
  DETENIDO: { label: "Detenido", color: "#E82C2C" },
  DISPONIBLE: { label: "Disponible", color: "#6E7278" },
} as const;

type Estado = keyof typeof ESTADO_CONFIG;

interface EstadoPillProps {
  estado: string;
  className?: string;
}

export function EstadoPill({ estado, className }: EstadoPillProps) {
  const cfg = ESTADO_CONFIG[(estado as Estado) ?? "DISPONIBLE"] ?? ESTADO_CONFIG.DISPONIBLE;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
        className
      )}
      style={{ color: cfg.color, backgroundColor: `${cfg.color}22` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

export function getEstadoColor(estado: string): string {
  return ESTADO_CONFIG[estado as Estado] ? ESTADO_CONFIG[estado as Estado].color : "#6E7278";
}
