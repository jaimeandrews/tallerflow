import { cn } from "@/lib/utils";

interface ProgresoProps {
  consumidas: number;
  estimadas: number;
  className?: string;
  compact?: boolean;
}

export function OFProgreso({ consumidas, estimadas, className, compact }: ProgresoProps) {
  const pct = estimadas > 0 ? (consumidas / estimadas) * 100 : 0;
  const display = Math.min(100, pct);
  const overrun = pct > 100;

  const barColor = overrun
    ? "bg-red-500"
    : pct > 85
      ? "bg-yellow-500"
      : pct > 50
        ? "bg-blue-500"
        : "bg-emerald-500";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn("flex items-center justify-between text-xs", compact && "text-[11px]")}>
        <span className="font-medium text-slate-700">
          {consumidas.toFixed(1)} / {estimadas.toFixed(1)} HH
        </span>
        <span className={cn("font-mono", overrun ? "text-red-600" : "text-slate-500")}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${display}%` }}
        />
      </div>
    </div>
  );
}
