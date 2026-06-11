import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";
import type { Prisma } from "@/generated/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const sucursalIdParam = request.nextUrl.searchParams.get("sucursalId");

  const where: Prisma.OrdenTrabajoWhereInput = { eliminada: false };
  if (aplicaFiltroSucursal(user.rol)) {
    where.sucursalId = user.sucursalId;
  } else if (sucursalIdParam) {
    where.sucursalId = sucursalIdParam;
  }

  const grupos = await prisma.ordenTrabajo.groupBy({
    by: ["estado"],
    where,
    _count: { _all: true },
  });

  const stats = {
    pendientes: 0,
    enProceso: 0,
    pausadas: 0,
    esperaRepuesto: 0,
    finalizadas: 0,
    criticas: 0,
    total: 0,
  };

  for (const g of grupos) {
    const n = g._count._all;
    stats.total += n;
    switch (g.estado) {
      case "PENDIENTE":
        stats.pendientes = n;
        break;
      case "EN_PROCESO":
        stats.enProceso = n;
        break;
      case "PAUSADA":
        stats.pausadas = n;
        break;
      case "ESPERA_REPUESTO":
        stats.esperaRepuesto = n;
        break;
      case "FINALIZADA":
        stats.finalizadas = n;
        break;
    }
  }

  stats.criticas = await prisma.ordenTrabajo.count({
    where: {
      ...where,
      critica: true,
      estado: { not: "FINALIZADA" },
    },
  });

  return Response.json({ stats });
}
