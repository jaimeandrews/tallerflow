import { cn } from "@/lib/utils";
import type { MarcajeHistorial, ResumenHH } from "@/types/marcaje";

function fmt(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dur(min: number | null) {
  if (!min) return "";
  const h = Math.floor(min / 60);
  const m = Math.floor(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface MarcajeTimelineProps {
  marcajes: MarcajeHistorial[];
  totales: ResumenHH;
  dark?: boolean;
}

export function MarcajeTimeline({ marcajes, totales, dark = false }: MarcajeTimelineProps) {
  const t = dark;
  return (
    <div className="space-y-3">
      <div className={cn("space-y-0 max-h-52 overflow-y-auto pr-1 -mr-1")}>
        {marcajes.length === 0 && (
          <p className={cn("text-xs py-2", t ? "text-white/35" : "text-slate-400")}>
            Sin marcajes hoy
          </p>
        )}
        {marcajes.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex items-start gap-2.5 text-xs py-2 border-b last:border-0",
              t ? "border-white/8" : "border-slate-100"
            )}
          >
            <span
              className={cn(
                "font-mono tabular-nums mt-0.5 flex-shrink-0",
                t ? "text-white/35" : "text-slate-400"
              )}
            >
              {fmt(m.horaInicio)}
            </span>
            <span
              className="w-2 h-2 rounded-full mt-1 flex-shrink-0"
              style={{ backgroundColor: m.actividad.color }}
            />
            <span className={cn("leading-snug", t ? "text-white/80" : "text-slate-600")}>
              {m.actividad.nombre}
              {m.ordenTrabajo && (
                <span className={t ? " text-white/35" : " text-slate-400"}>
                  {" "}
                  · OF-{m.ordenTrabajo.numero}
                </span>
              )}
              {m.duracionMinutos && (
                <span className={t ? " text-white/35" : " text-slate-400"}>
                  {" "}
                  {dur(m.duracionMinutos)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div
        className={cn(
          "pt-2 border-t space-y-1 text-xs",
          t ? "border-white/10" : "border-slate-200"
        )}
      >
        <div className="flex justify-between">
          <span className={t ? "text-white/40" : "text-slate-500"}>Productivas</span>
          <span className="text-green-500 font-semibold">{totales.productivas.toFixed(1)}h</span>
        </div>
        <div className="flex justify-between">
          <span className={t ? "text-white/40" : "text-slate-500"}>No productivas</span>
          <span className="text-yellow-500 font-semibold">{totales.noProductivas.toFixed(1)}h</span>
        </div>
        <div
          className={cn(
            "flex justify-between font-semibold pt-1 border-t",
            t ? "border-white/10 text-white/70" : "border-slate-200 text-slate-700"
          )}
        >
          <span>Total</span>
          <span>{totales.total.toFixed(1)}h</span>
        </div>
      </div>
    </div>
  );
}
