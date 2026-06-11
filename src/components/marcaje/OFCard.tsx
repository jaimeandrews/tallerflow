import { cn } from "@/lib/utils";
import type { OrdenInfo } from "@/types/marcaje";

const PRIORIDAD_COLOR: Record<string, string> = {
  CRITICA: "#E82C2C",
  ALTA: "#F97316",
  MEDIA: "#F4A91A",
  BAJA: "#6E7278",
};
const PRIORIDAD_LABEL: Record<string, string> = {
  CRITICA: "Crítica",
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

interface OFCardProps {
  of: OrdenInfo;
  actividadNombre?: string;
  dark?: boolean;
}

export function OFCard({ of, actividadNombre, dark = false }: OFCardProps) {
  const p = of.prioridad ?? "";
  const pColor = PRIORIDAD_COLOR[p] ?? "#6E7278";
  const consumed = of.hhConsumidas ?? 0;
  const estimated = of.hhEstimadas ?? 0;
  const progress = estimated > 0 ? Math.min(100, (consumed / estimated) * 100) : 0;
  const barColor = progress > 90 ? "#E82C2C" : progress > 70 ? "#F4A91A" : "#2C8A4A";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs uppercase tracking-wider mb-0.5",
              dark ? "text-white/40" : "text-slate-500"
            )}
          >
            Orden activa
          </p>
          <p
            className={cn(
              "text-3xl font-bold leading-none truncate",
              dark ? "text-white" : "text-slate-900"
            )}
          >
            OF-{of.numero}
          </p>
        </div>
        {p && (
          <span
            className="flex-shrink-0 px-2 py-0.5 rounded text-xs font-bold"
            style={{ color: pColor, backgroundColor: `${pColor}20` }}
          >
            {PRIORIDAD_LABEL[p]}
          </span>
        )}
      </div>

      {/* Pills */}
      <div className="flex flex-wrap gap-2">
        {actividadNombre && (
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#00AEEF]/20 text-[#00AEEF]">
            {actividadNombre}
          </span>
        )}
        <span
          className={cn(
            "px-2 py-0.5 rounded text-xs",
            dark ? "bg-white/10 text-white/55" : "bg-slate-100 text-slate-500"
          )}
        >
          {of.nombre}
        </span>
      </div>

      {/* Cliente · equipo */}
      {(of.cliente || of.equipo) && (
        <p className={cn("text-sm truncate", dark ? "text-white/50" : "text-slate-500")}>
          {[of.cliente, of.equipo].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* Progress */}
      {estimated > 0 && (
        <div className="space-y-1.5">
          <div
            className={cn(
              "h-1.5 rounded-full overflow-hidden",
              dark ? "bg-white/10" : "bg-slate-200"
            )}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: barColor }}
            />
          </div>
          <div
            className={cn(
              "flex justify-between text-xs",
              dark ? "text-white/40" : "text-slate-400"
            )}
          >
            <span>{consumed.toFixed(1)}h consumidas</span>
            <span>{estimated}h estimadas</span>
          </div>
        </div>
      )}
    </div>
  );
}
