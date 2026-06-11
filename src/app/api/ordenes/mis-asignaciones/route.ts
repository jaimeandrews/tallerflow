import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const asignaciones = await prisma.asignacionTecnico.findMany({
    where: {
      usuarioId: user.id,
      activa: true,
      ordenTrabajo: {
        estado: { not: "FINALIZADA" },
        sucursalId: user.sucursalId,
      },
    },
    select: {
      id: true,
      hhPlanificadas: true,
      fechaAsignacion: true,
      ordenTrabajo: {
        select: {
          id: true,
          numero: true,
          nombre: true,
          cliente: true,
          equipo: true,
          estado: true,
          prioridad: true,
          hhEstimadas: true,
          hhConsumidas: true,
          critica: true,
          slaVencimiento: true,
        },
      },
    },
    orderBy: { ordenTrabajo: { prioridad: "asc" } },
  });

  return Response.json({ asignaciones });
}
