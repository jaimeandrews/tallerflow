import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";
import {
  finDelDiaUTC,
  horasEnRango,
  parseDateUTC,
  r1,
  rango,
  ymd,
} from "@/lib/services/reportes-service";
import { MAX_DIAS_REPORTE } from "@/types/reportes";

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
  desde: z.iso.date(),
  hasta: z.iso.date(),
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

  const { desde, hasta } = parsed.data;
  const desdeDate = parseDateUTC(desde);
  const hastaDate = finDelDiaUTC(hasta);

  if (Math.ceil((hastaDate.getTime() - desdeDate.getTime()) / 86_400_000) > MAX_DIAS_REPORTE) {
    return Response.json(
      { error: `El rango no puede superar ${MAX_DIAS_REPORTE} días` },
      { status: 400 }
    );
  }

  let sucursalId: string | undefined;
  if (aplicaFiltroSucursal(user.rol)) {
    sucursalId = user.sucursalId;
  } else {
    sucursalId = parsed.data.sucursalId;
  }

  const marcajes = await prisma.marcaje.findMany({
    where: {
      ...(sucursalId ? { sucursalId } : {}),
      horaInicio: { gte: desdeDate, lte: hastaDate },
      usuario: { rol: "TECNICO" },
    },
    select: {
      horaInicio: true,
      horaFin: true,
      actividad: { select: { productiva: true } },
    },
  });

  const desdeMs = desdeDate.getTime();
  const hastaMs = hastaDate.getTime();
  const fechas = rango(desdeDate, hastaDate);

  const data = fechas.map((fecha) => {
    const diaInicio = new Date(`${fecha}T00:00:00.000Z`).getTime();
    const diaFin = Math.min(new Date(`${fecha}T23:59:59.999Z`).getTime(), hastaMs);

    let hhP = 0;
    let hhNP = 0;
    for (const m of marcajes) {
      if (m.horaInicio.getTime() < diaInicio || m.horaInicio.getTime() > diaFin) continue;
      const hh = horasEnRango(m.horaInicio, m.horaFin, diaInicio, diaFin);
      if (m.actividad.productiva) hhP += hh;
      else hhNP += hh;
    }

    return {
      fecha,
      label: fecha.slice(5), // MM-DD para eje X
      hhProductivas: r1(hhP),
      hhNoProductivas: r1(hhNP),
    };
  });

  return Response.json({ data });
}
