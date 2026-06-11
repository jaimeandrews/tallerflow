import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { HH_CAPACIDAD_DIARIA, sucursalWhereFromUser } from "@/lib/services/asignacion-service";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const sucursalId = sucursalWhereFromUser(
    user.rol,
    user.sucursalId,
    sp.get("sucursalId") ?? undefined
  );

  const [tecnicos, ordenes] = await Promise.all([
    prisma.usuario.findMany({
      where: { rol: "TECNICO", activo: true, sucursalId },
      select: {
        id: true,
        asignaciones: {
          where: {
            activa: true,
            ordenTrabajo: { estado: { not: "FINALIZADA" }, eliminada: false },
          },
          select: { hhPlanificadas: true },
        },
      },
    }),
    prisma.ordenTrabajo.findMany({
      where: { sucursalId, eliminada: false, estado: { not: "FINALIZADA" } },
      select: {
        id: true,
        tecnicosRequeridos: true,
        asignaciones: {
          where: { activa: true },
          select: { usuarioId: true, hhPlanificadas: true },
        },
      },
    }),
  ]);

  const totalTecnicos = tecnicos.length;
  const hhDisponibles = totalTecnicos * HH_CAPACIDAD_DIARIA;

  // Per-technician total HH
  const hhPorTecnico: Record<string, number> = {};
  for (const t of tecnicos) {
    hhPorTecnico[t.id] = t.asignaciones.reduce((acc, a) => acc + a.hhPlanificadas, 0);
  }

  const tecnicosAsignados = tecnicos.filter((t) => (hhPorTecnico[t.id] ?? 0) > 0).length;
  const sobreCapacidad = tecnicos.filter(
    (t) => (hhPorTecnico[t.id] ?? 0) > HH_CAPACIDAD_DIARIA
  ).length;

  let hhPlanificadasTotal = 0;
  let ofSinAsignar = 0;
  for (const of_ of ordenes) {
    const asignadosCount = of_.asignaciones.length;
    const faltantes = Math.max(0, of_.tecnicosRequeridos - asignadosCount);
    if (faltantes > 0) ofSinAsignar++;
    hhPlanificadasTotal += of_.asignaciones.reduce((acc, a) => acc + a.hhPlanificadas, 0);
  }

  const utilizacion =
    hhDisponibles > 0 ? Math.round((hhPlanificadasTotal / hhDisponibles) * 100) : 0;

  return Response.json({
    resumen: {
      tecnicosAsignados,
      totalTecnicos,
      hhPlanificadas: Math.round(hhPlanificadasTotal * 10) / 10,
      hhDisponibles,
      utilizacion,
      ofSinAsignar,
      sobreCapacidad,
      totalOrdenes: ordenes.length,
    },
  });
}
