import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  error: string | null;
  className?: string;
}

/**
 * Indicador sutil de error para secciones del dashboard.
 * Aparece junto al título cuando el último refresh falló pero seguimos
 * mostrando el estado previo. Hover para ver el detalle.
 */
export function ErrorIndicator({ error, className }: Props) {
  if (!error) return null;
  return (
    <span
      title={error}
      role="status"
      aria-label={`Error de actualización: ${error}`}
      className={cn("inline-flex h-4 w-4 items-center justify-center text-amber-500", className)}
    >
      <AlertTriangle className="h-3.5 w-3.5" />
    </span>
  );
}
