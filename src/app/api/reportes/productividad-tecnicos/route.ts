import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";
import {
  MAX_DIAS_REPORTE,
  type DesgloseActividad,
  type TecnicoProductividad,
} from "@/types/reportes";
import {
  finDelDiaUTC,
  horasEnRango,
  parseDateUTC,
  r1,
  rango,
  r0,
  tendencia,
  ymd,
} from "@/lib/services/reportes-service";

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
  desde: z.iso.date(),
  hasta: z.iso.date(),
  tecnicoId: z.uuid().optional(),
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

  const { desde, hasta, tecnicoId } = parsed.data;

  const desdeDate = parseDateUTC(desde);
  const hastaDate = finDelDiaUTC(hasta);
  const diasDiff = Math.ceil((hastaDate.getTime() - desdeDate.getTime()) / 86_400_000);
  if (diasDiff > MAX_DIAS_REPORTE) {
    return Response.json(
      { error: `El rango no puede superar ${MAX_DIAS_REPORTE} días` },
      { status: 400 }
    );
  }

  // Sucursal según rol
  let sucursalId: string | undefined;
  if (aplicaFiltroSucursal(user.rol)) {
    sucursalId = user.sucursalId;
  } else {
    sucursalId = parsed.data.sucursalId;
  }

  const marcajes = await prisma.marcaje.findMany({
    where: {
      ...(sucursalId ? { sucursalId } : {}),
      ...(tecnicoId ? { usuarioId: tecnicoId } : {}),
      horaInicio: { gte: desdeDate, lte: hastaDate },
      usuario: { rol: "TECNICO" },
    },
    select: {
      usuarioId: true,
      horaInicio: true,
      horaFin: true,
      ordenTrabajoId: true,
      actividad: {
        select: { id: true, nombre: true, color: true, productiva: true },
      },
      usuario: {
        select: { nombre: true, apellido: true, iniciales: true, color: true },
      },
    },
  });

  const desdeMs = desdeDate.getTime();
  const hastaMs = hastaDate.getTime();
  const fechas = rango(desdeDate, hastaDate);

  // Agrupar por técnico
  const byUser = new Map<
    string,
    { usuario: (typeof marcajes)[0]["usuario"]; marcajes: typeof marcajes }
  >();
  for (const m of marcajes) {
    if (!byUser.has(m.usuarioId)) {
      byUser.set(m.usuarioId, { usuario: m.usuario, marcajes: [] });
    }
    byUser.get(m.usuarioId)!.marcajes.push(m);
  }

  const resultado: TecnicoProductividad[] = [];

  for (const [id, { usuario, marcajes: mks }] of byUser) {
    let hhProd = 0;
    let hhNoProd = 0;
    const diasSet = new Set<string>();
    const ofSet = new Set<string>();
    const byActividad = new Map<string, { actividad: (typeof mks)[0]["actividad"]; hh: number }>();

    for (const m of mks) {
      const hh = horasEnRango(m.horaInicio, m.horaFin, desdeMs, hastaMs);
      if (m.actividad.productiva) hhProd += hh;
      else hhNoProd += hh;
      diasSet.add(ymd(m.horaInicio));
      if (m.ordenTrabajoId) ofSet.add(m.ordenTrabajoId);

      const ex = byActividad.get(m.actividad.id);
      if (ex) ex.hh += hh;
      else byActividad.set(m.actividad.id, { actividad: m.actividad, hh });
    }

    const hhTotal = hhProd + hhNoProd;
    const productividad = hhTotal > 0 ? r0((hhProd / hhTotal) * 100) : 0;
    const diasTrabajados = diasSet.size;
    const promedioHHDia = diasTrabajados > 0 ? r1(hhTotal / diasTrabajados) : 0;

    // Actividad principal
    let actPrincipal = "—";
    let maxHH = 0;
    const desglose: DesgloseActividad[] = [];
    for (const [, { actividad, hh }] of byActividad) {
      const pct = hhTotal > 0 ? r0((hh / hhTotal) * 100) : 0;
      desglose.push({
        actividadId: actividad.id,
        nombre: actividad.nombre,
        color: actividad.color,
        productiva: actividad.productiva,
        hh: r1(hh),
        porcentaje: pct,
      });
      if (hh > maxHH) {
        maxHH = hh;
        actPrincipal = actividad.nombre;
      }
    }
    desglose.sort((a, b) => b.hh - a.hh);

    resultado.push({
      tecnicoId: id,
      nombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
      iniciales: usuario.iniciales,
      color: usuario.color,
      hhProductivas: r1(hhProd),
      hhNoProductivas: r1(hhNoProd),
      hhTotal: r1(hhTotal),
      productividad,
      diasTrabajados,
      promedioHHDia,
      actividadPrincipal: actPrincipal,
      ofAtendidas: ofSet.size,
      desglosePorActividad: desglose,
      tendencia: tendencia(mks, fechas, hastaMs),
    });
  }

  resultado.sort((a, b) => b.productividad - a.productividad);
  return Response.json({ data: resultado, total: resultado.length });
}
