import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  ESTADO_TECNICO_PRIORIDAD,
  obtenerEstadoTecnico,
  resolverSucursalId,
} from "@/lib/services/dashboard-service";

const queryShape = z.object({
  sucursalId: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(12),
});

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = queryShape.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sucursalId = resolverSucursalId(user.rol, user.sucursalId, parsed.data.sucursalId);
  const { limite } = parsed.data;

  const tecnicos = await prisma.usuario.findMany({
    where: { rol: "TECNICO", activo: true, sucursalId },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      iniciales: true,
      color: true,
      marcajes: {
        take: 1,
        orderBy: { horaInicio: "desc" },
        select: {
          tipo: true,
          horaInicio: true,
          horaFin: true,
          duracionMinutos: true,
          actividad: {
            select: { id: true, nombre: true, color: true, productiva: true },
          },
          ordenTrabajo: {
            select: { id: true, numero: true, nombre: true },
          },
        },
      },
    },
  });

  const ahora = Date.now();

  const items = tecnicos.map((t) => {
    const ultimo = t.marcajes[0] ?? null;
    const estado = obtenerEstadoTecnico(ultimo);
    const tieneActivo = !!ultimo && ultimo.horaFin === null;

    const duracionSegundos = tieneActivo
      ? Math.max(0, Math.floor((ahora - new Date(ultimo!.horaInicio).getTime()) / 1000))
      : null;

    return {
      id: t.id,
      nombre: `${t.nombre} ${t.apellido}`.trim(),
      iniciales: t.iniciales,
      color: t.color,
      estado,
      actividad: tieneActivo ? ultimo!.actividad.nombre : null,
      ofActiva: tieneActivo ? (ultimo!.ordenTrabajo?.numero ?? null) : null,
      inicio: tieneActivo ? ultimo!.horaInicio.toISOString() : null,
      duracionSegundos,
    };
  });

  items.sort((a, b) => {
    const dp = ESTADO_TECNICO_PRIORIDAD[a.estado] - ESTADO_TECNICO_PRIORIDAD[b.estado];
    if (dp !== 0) return dp;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  return Response.json({
    tecnicos: items.slice(0, limite),
    total: items.length,
  });
}
