import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const marcaje = await prisma.marcaje.findFirst({
    where: { usuarioId: user.id, horaFin: null },
    orderBy: { horaInicio: "desc" },
    select: {
      id: true,
      tipo: true,
      horaInicio: true,
      horaFin: true,
      duracionMinutos: true,
      notas: true,
      actividad: {
        select: { id: true, nombre: true, color: true, icono: true, productiva: true },
      },
      ordenTrabajo: {
        select: {
          id: true,
          numero: true,
          nombre: true,
          cliente: true,
          equipo: true,
          prioridad: true,
          hhEstimadas: true,
          hhConsumidas: true,
          critica: true,
        },
      },
    },
  });

  if (!marcaje) {
    return Response.json({ marcaje: null });
  }

  const duracionVivo = Math.floor((Date.now() - new Date(marcaje.horaInicio).getTime()) / 1000);

  return Response.json({ marcaje: { ...marcaje, duracionVivo } });
}
