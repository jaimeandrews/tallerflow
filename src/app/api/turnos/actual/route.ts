import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const horaActual = `${hh}:${mm}`;

  const turnos = await prisma.turno.findMany({
    where: { sucursalId: user.sucursalId, activo: true },
    select: { id: true, nombre: true, horaInicio: true, horaFin: true, sucursalId: true },
  });

  const turnoActual = turnos.find((t) => horaActual >= t.horaInicio && horaActual <= t.horaFin);

  return Response.json({ turno: turnoActual ?? null });
}
