import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { resolverSucursalId } from "@/lib/services/dashboard-service";
import { ESTADO_OF_COLORS, ESTADO_OF_LABELS } from "@/lib/utils/constants";
import type { SegmentoTipo } from "@/types/centro-control";
import type { TipoMarcaje } from "@/generated/prisma";

const HORA_RANGO_INICIO = 7; // 07:00
const HORA_RANGO_FIN = 18; // 18:00

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(20).default(8),
});

function clasificarSegmento(
  tipo: TipoMarcaje,
  actividad: { nombre: string; productiva: boolean }
): { tipo: SegmentoTipo; color: string } {
  if (tipo === "PAUSA") return { tipo: "pausa", color: "#F4A91A" };
  if (actividad.nombre === "Espera repuesto") return { tipo: "espera_repuesto", color: "#E82C2C" };
  if (actividad.productiva) return { tipo: "trabajando", color: "#00AEEF" };
  return { tipo: "otro", color: "#6E7278" };
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
  const { limite } = parsed.data;

  // Rango horario del ribbon: 07:00 a 18:00 de hoy (local server).
  const ahora = new Date();
  const rangoInicio = new Date(ahora);
  rangoInicio.setHours(HORA_RANGO_INICIO, 0, 0, 0);
  const rangoFin = new Date(ahora);
  rangoFin.setHours(HORA_RANGO_FIN, 0, 0, 0);

  const ordenes = await prisma.ordenTrabajo.findMany({
    where: {
      sucursalId,
      eliminada: false,
      estado: { in: ["EN_PROCESO", "PAUSADA", "ESPERA_REPUESTO"] },
      marcajes: { some: { horaInicio: { gte: rangoInicio } } },
    },
    orderBy: { updatedAt: "desc" },
    take: limite,
    select: {
      id: true,
      numero: true,
      nombre: true,
      estado: true,
      marcajes: {
        where: { horaInicio: { gte: rangoInicio } },
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

  const items = ordenes.map((of) => ({
    id: of.id,
    numero: of.numero,
    nombre: of.nombre,
    estado: of.estado,
    estadoLabel: ESTADO_OF_LABELS[of.estado],
    estadoColorClass: ESTADO_OF_COLORS[of.estado],
    segmentos: of.marcajes.map((m) => {
      const cfg = clasificarSegmento(m.tipo, m.actividad);
      return {
        inicio: m.horaInicio.toISOString(),
        fin: m.horaFin ? m.horaFin.toISOString() : null,
        tipo: cfg.tipo,
        color: cfg.color,
        actividadNombre: m.actividad.nombre,
      };
    }),
  }));

  return Response.json({
    ordenes: items,
    rangoInicio: rangoInicio.toISOString(),
    rangoFin: rangoFin.toISOString(),
  });
}
