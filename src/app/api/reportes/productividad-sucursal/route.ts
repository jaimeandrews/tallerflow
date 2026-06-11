import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  MAX_DIAS_REPORTE,
  ROLES_SUCURSAL_REPORT,
  type SucursalProductividad,
} from "@/types/reportes";
import {
  diasLaborales,
  finDelDiaUTC,
  horasEnRango,
  parseDateUTC,
  r0,
  r1,
  rango,
  tendencia,
} from "@/lib/services/reportes-service";

const querySchema = z.object({
  desde: z.iso.date(),
  hasta: z.iso.date(),
});

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!ROLES_SUCURSAL_REPORT.includes(user.rol)) {
    return Response.json({ error: "Sin permisos para acceder a este reporte" }, { status: 403 });
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

  const desdeMs = desdeDate.getTime();
  const hastaMs = hastaDate.getTime();
  const fechas = rango(desdeDate, hastaDate);
  const diasLab = diasLaborales(desdeDate, hastaDate);

  // Si no es ADMIN, sólo ve su sucursal
  const sucursalWhere = user.rol === "ADMIN" ? {} : { id: user.sucursalId };

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true, ...sucursalWhere },
    select: { id: true, nombre: true },
  });

  const resultado: SucursalProductividad[] = [];

  await Promise.all(
    sucursales.map(async (suc) => {
      const [tecnicosActivos, marcajes, ofData] = await Promise.all([
        prisma.usuario.count({
          where: { sucursalId: suc.id, rol: "TECNICO", activo: true },
        }),
        prisma.marcaje.findMany({
          where: {
            sucursalId: suc.id,
            horaInicio: { gte: desdeDate, lte: hastaDate },
          },
          select: {
            horaInicio: true,
            horaFin: true,
            actividad: { select: { productiva: true } },
          },
        }),
        prisma.ordenTrabajo.findMany({
          where: {
            sucursalId: suc.id,
            eliminada: false,
            updatedAt: { gte: desdeDate },
          },
          select: {
            estado: true,
            hhEstimadas: true,
            hhConsumidas: true,
            slaVencimiento: true,
            updatedAt: true,
          },
        }),
      ]);

      let hhProd = 0;
      let hhNoProd = 0;
      for (const m of marcajes) {
        const hh = horasEnRango(m.horaInicio, m.horaFin, desdeMs, hastaMs);
        if (m.actividad.productiva) hhProd += hh;
        else hhNoProd += hh;
      }
      const hhTotal = hhProd + hhNoProd;
      const productividad = hhTotal > 0 ? r0((hhProd / hhTotal) * 100) : 0;

      const capacidad = tecnicosActivos * 8 * diasLab;
      const utilizacion = capacidad > 0 ? r0((hhTotal / capacidad) * 100) : 0;

      const ofFinalizadas = ofData.filter((o) => o.estado === "FINALIZADA");
      const mttr =
        ofFinalizadas.length > 0
          ? r1(ofFinalizadas.reduce((a, o) => a + o.hhConsumidas, 0) / ofFinalizadas.length)
          : 0;

      const ofConSla = ofFinalizadas.filter((o) => o.slaVencimiento);
      const ofDentroSla = ofConSla.filter(
        (o) => o.slaVencimiento && o.updatedAt <= o.slaVencimiento
      );
      const slaCumplimiento =
        ofConSla.length > 0 ? r0((ofDentroSla.length / ofConSla.length) * 100) : 100;

      resultado.push({
        sucursalId: suc.id,
        nombre: suc.nombre,
        tecnicosActivos,
        ofTotal: ofData.length,
        ofFinalizadas: ofFinalizadas.length,
        hhProductivas: r1(hhProd),
        hhNoProductivas: r1(hhNoProd),
        productividad,
        utilizacion,
        mttr,
        slaCumplimiento,
        tendencia: tendencia(marcajes, fechas, hastaMs),
      });
    })
  );

  resultado.sort((a, b) => b.productividad - a.productividad);
  return Response.json({ data: resultado, total: resultado.length });
}
