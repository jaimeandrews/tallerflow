/**
 * Endpoint de evaluación de alertas — invocable manualmente o desde un cron
 * externo (AWS EventBridge / CloudWatch Events). El custom server también
 * ejecuta `evaluarTodasLasSucursales()` directamente cada 60s (sin pasar por
 * HTTP), pero este endpoint queda disponible para producción.
 *
 * Autenticación: cabecera `Authorization: Bearer <CRON_SECRET>`.
 * En desarrollo, si `CRON_SECRET` no está configurado, se permite sin token
 * para facilitar pruebas manuales con curl.
 */

import { type NextRequest } from "next/server";
import { evaluarTodasLasSucursales } from "@/lib/services/alerta-service";

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (expected) {
    if (!provided || provided !== expected) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // En prod sin CRON_SECRET → bloqueamos por seguridad
    return Response.json({ error: "CRON_SECRET no configurado en producción" }, { status: 500 });
  }

  const t0 = Date.now();
  try {
    await evaluarTodasLasSucursales();
    return Response.json({
      ok: true,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    console.error("[cron] evaluar-alertas error:", err);
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
