import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const marcajes = await prisma.marcaje.findMany({
    where: {
      usuarioId: user.id,
      horaInicio: { gte: startOfDay, lte: endOfDay },
    },
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
        select: { id: true, numero: true, nombre: true, cliente: true },
      },
    },
  });

  let productivas = 0;
  let noProductivas = 0;
  for (const m of marcajes) {
    if (m.duracionMinutos === null) continue;
    const horas = m.duracionMinutos / 60;
    if (m.actividad.productiva) {
      productivas += horas;
    } else {
      noProductivas += horas;
    }
  }

  return Response.json({
    marcajes,
    resumen: { productivas, noProductivas, total: productivas + noProductivas },
  });
}
