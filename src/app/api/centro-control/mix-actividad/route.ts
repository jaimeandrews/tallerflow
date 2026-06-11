import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { inicioDelDia, resolverSucursalId } from "@/lib/services/dashboard-service";

// Colores fijos por nombre de actividad (según spec del centro de control).
// Cualquier actividad fuera del catálogo recibe COLOR_DEFAULT.
const COLOR_POR_ACTIVIDAD: Record<string, string> = {
  Reparación: "#00AEEF",
  Diagnóstico: "#0090CC",
  Garantía: "#F47920",
  "Aseo taller": "#6E7278",
  Aseo: "#6E7278",
  Reunión: "#4A4D52",
  Almuerzo: "#F4A91A",
  "Espera repuesto": "#E82C2C",
};
const COLOR_DEFAULT = "#94A3B8";

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
});

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

  const ahora = new Date();
  const inicioHoy = inicioDelDia(ahora);

  const marcajes = await prisma.marcaje.findMany({
    where: { sucursalId, horaInicio: { gte: inicioHoy, lte: ahora } },
    select: {
      horaInicio: true,
      horaFin: true,
      actividad: {
        select: { id: true, nombre: true, productiva: true },
      },
    },
  });

  // Agregamos por actividadId computando duración real
  // (marcajes activos: now - horaInicio).
  const agg = new Map<string, { id: string; nombre: string; productiva: boolean; horas: number }>();

  for (const m of marcajes) {
    const inicio = m.horaInicio.getTime();
    const fin = m.horaFin ? m.horaFin.getTime() : ahora.getTime();
    if (fin <= inicio) continue;
    const horas = (fin - inicio) / 3_600_000;
    const existing = agg.get(m.actividad.id);
    if (existing) {
      existing.horas += horas;
    } else {
      agg.set(m.actividad.id, {
        id: m.actividad.id,
        nombre: m.actividad.nombre,
        productiva: m.actividad.productiva,
        horas,
      });
    }
  }

  const lista = [...agg.values()];
  const totalHoras = lista.reduce((acc, a) => acc + a.horas, 0);

  const segmentos = lista
    .map((a) => ({
      actividadId: a.id,
      actividadNombre: a.nombre,
      productiva: a.productiva,
      horas: Math.round(a.horas * 10) / 10,
      porcentaje: totalHoras > 0 ? Math.round((a.horas / totalHoras) * 100) : 0,
      color: COLOR_POR_ACTIVIDAD[a.nombre] ?? COLOR_DEFAULT,
    }))
    .sort((a, b) => b.horas - a.horas);

  const productivasHrs = lista.filter((a) => a.productiva).reduce((acc, a) => acc + a.horas, 0);
  const productivasPct = totalHoras > 0 ? Math.round((productivasHrs / totalHoras) * 100) : 0;
  const noProductivasPct = totalHoras > 0 ? Math.max(0, 100 - productivasPct) : 0;

  return Response.json({
    segmentos,
    totalHoras: Math.round(totalHoras * 10) / 10,
    productivasPct,
    noProductivasPct,
  });
}
