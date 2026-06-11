import { type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { resolverAlerta } from "@/lib/services/alerta-service";

const schema = z.object({
  alertaId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const result = await resolverAlerta({
    alertaId: parsed.data.alertaId,
    usuarioId: user.id,
    usuarioNombre: user.nombre,
    ip: getClientIp(request),
  });

  if (!result.ok) {
    const status =
      result.error === "Alerta no encontrada"
        ? 404
        : result.error === "La alerta ya fue resuelta"
          ? 409
          : 400;
    return Response.json({ error: result.error }, { status });
  }

  return Response.json({ ok: true, alerta: result.alerta });
}
