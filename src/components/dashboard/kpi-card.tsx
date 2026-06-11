import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export type KpiTono = "default" | "accent" | "good" | "warn" | "danger";

interface KpiCardProps {
  titulo: string;
  valor: string | number;
  unidad?: string;
  trend?: string;
  tono?: KpiTono;
  trendIcon?: "up" | "down" | "flat";
  loading?: boolean;
  className?: string;
}

const TONO_STYLES: Record<KpiTono, { bar: string; value: string; trend: string }> = {
  default: {
    bar: "bg-slate-300",
    value: "text-slate-900",
    trend: "text-slate-500",
  },
  accent: {
    bar: "bg-[#006FA0]",
    value: "text-slate-900",
    trend: "text-slate-500",
  },
  good: {
    bar: "bg-green-500",
    value: "text-green-700",
    trend: "text-green-600",
  },
  warn: {
    bar: "bg-amber-500",
    value: "text-amber-700",
    trend: "text-amber-600",
  },
  danger: {
    bar: "bg-red-500",
    value: "text-red-700",
    trend: "text-red-600",
  },
};

export function KpiCard({
  titulo,
  valor,
  unidad,
  trend,
  tono = "default",
  trendIcon,
  loading = false,
  className,
}: KpiCardProps) {
  const styles = TONO_STYLES[tono];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm",
        className
      )}
    >
      <span className={cn("absolute left-0 top-0 h-full w-1", styles.bar)} aria-hidden />

      <div className="pl-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{titulo}</p>

        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <div className="mt-1 flex items-baseline gap-1">
            <span className={cn("text-3xl font-bold leading-tight", styles.value)}>{valor}</span>
            {unidad && <span className="text-sm font-medium text-slate-500">{unidad}</span>}
          </div>
        )}

        {loading ? (
          <Skeleton className="mt-3 h-3 w-32" />
        ) : trend ? (
          <p className={cn("mt-1 text-xs", styles.trend)}>
            {trendIcon === "up" && <span aria-hidden>▲ </span>}
            {trendIcon === "down" && <span aria-hidden>▼ </span>}
            {trend}
          </p>
        ) : null}
      </div>
    </div>
  );
}
