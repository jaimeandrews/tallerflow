/**
 * Versión de los segmentos del ribbon con horas formateadas en "HH:MM"
 * (en vez de ISO timestamps). Útil para integraciones externas o para una
 * UI distinta del ribbon visual. Por el centro de control real se usa
 * `/api/centro-control/of-ribbon` que devuelve ISO.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { resolverSucursalId } from "@/lib/services/dashboard-service";
import { ESTADO_OF_LABELS } from "@/lib/utils/constants";
import type { TipoMarcaje } from "@/generated/prisma";

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
  fecha: z.iso.date().optional(),
});

function clasificarColor(
  tipo: TipoMarcaje,
  actividad: { nombre: string; productiva: boolean }
): string {
  if (tipo === "PAUSA") return "#F4A91A";
  if (actividad.nombre === "Espera repuesto") return "#E82C2C";
  if (actividad.productiva) return "#00AEEF";
  return "#6E7278";
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sucursalId = resolverSucursalId(user.rol, user.sucursalId, parsed.data.sucursalId);

  const baseDate = parsed.data.fecha ? new Date(parsed.data.fecha) : new Date();
  const inicioDia = new Date(baseDate);
  inicioDia.setHours(0, 0, 0, 0);
  const finDia = new Date(baseDate);
  finDia.setHours(23, 59, 59, 999);
  const ahora = new Date();
  const enHoy = inicioDia.toDateString() === ahora.toDateString();

  const ordenes = await prisma.ordenTrabajo.findMany({
    where: {
      sucursalId,
      eliminada: false,
      estado: { in: ["EN_PROCESO", "PAUSADA", "ESPERA_REPUESTO"] },
      marcajes: { some: { horaInicio: { gte: inicioDia, lte: finDia } } },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      numero: true,
      nombre: true,
      estado: true,
      marcajes: {
        where: { horaInicio: { gte: inicioDia, lte: finDia } },
        orderBy: { horaInicio: "asc" },
        select: {
          tipo: true,
          horaInicio: true,
          horaFin: true,
          actividad: { select: { nombre: true, productiva: true } },
        },
      },
    },
  });

  const data = ordenes.map((of) => ({
    ofId: of.id,
    ofNumero: of.numero,
    ofNombre: of.nombre,
    estado: of.estado,
    estadoLabel: ESTADO_OF_LABELS[of.estado],
    segmentos: of.marcajes.map((m) => ({
      desde: hhmm(m.horaInicio),
      hasta: m.horaFin ? hhmm(m.horaFin) : enHoy ? "now" : hhmm(finDia),
      color: clasificarColor(m.tipo, m.actividad),
      actividad: m.actividad.nombre,
    })),
  }));

  return Response.json({ data });
}
