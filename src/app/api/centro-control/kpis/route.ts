import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  ayerMismaHora,
  calcularHHHastaCorte,
  diasAtras,
  inicioDelDia,
  resolverSucursalId,
} from "@/lib/services/dashboard-service";

const MTTR_DIAS = 7;
const MTTR_META_HORAS = 8;

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
  const cutoffAyer = ayerMismaHora(ahora);
  const inicioAyer = inicioDelDia(cutoffAyer);
  const desde7d = diasAtras(MTTR_DIAS, ahora);

  const [
    tecnicosTotal,
    marcajesHoy,
    marcajesAyer,
    ofEnProceso,
    ofSobreSla,
    ofFinalizadasUlt7d,
    alertasPorNivel,
  ] = await Promise.all([
    prisma.usuario.count({
      where: { rol: "TECNICO", activo: true, sucursalId },
    }),
    prisma.marcaje.findMany({
      where: { sucursalId, horaInicio: { gte: inicioHoy, lte: ahora } },
      select: {
        usuarioId: true,
        horaInicio: true,
        horaFin: true,
        duracionMinutos: true,
        actividad: { select: { nombre: true, productiva: true } },
      },
    }),
    prisma.marcaje.findMany({
      where: { sucursalId, horaInicio: { gte: inicioAyer, lte: cutoffAyer } },
      select: {
        horaInicio: true,
        horaFin: true,
        duracionMinutos: true,
        actividad: { select: { nombre: true, productiva: true } },
      },
    }),
    prisma.ordenTrabajo.count({
      where: { sucursalId, eliminada: false, estado: "EN_PROCESO" },
    }),
    prisma.ordenTrabajo.count({
      where: {
        sucursalId,
        eliminada: false,
        estado: { not: "FINALIZADA" },
        slaVencimiento: { lt: ahora },
      },
    }),
    prisma.ordenTrabajo.findMany({
      where: {
        sucursalId,
        eliminada: false,
        estado: "FINALIZADA",
        updatedAt: { gte: desde7d, lte: ahora },
      },
      select: { hhConsumidas: true },
    }),
    prisma.alerta.groupBy({
      by: ["nivel"],
      where: { sucursalId, resuelta: false },
      _count: { _all: true },
    }),
  ]);

  // Card 1 — Carga del taller
  const tecnicosActivosSet = new Set<string>();
  for (const m of marcajesHoy) {
    if (m.horaFin === null) tecnicosActivosSet.add(m.usuarioId);
  }
  const tecnicosActivos = tecnicosActivosSet.size;
  const cargaPorcentaje =
    tecnicosTotal > 0 ? Math.round((tecnicosActivos / tecnicosTotal) * 100) : 0;

  // Card 3 — Tiempo no productivo + delta vs ayer
  const hhHoy = calcularHHHastaCorte(marcajesHoy, ahora);
  const hhAyer = calcularHHHastaCorte(marcajesAyer, cutoffAyer);
  const tnpHoy = hhHoy.noProductivas;
  const tnpAyer = hhAyer.noProductivas;
  const deltaPctAyer =
    tnpAyer > 0 ? Math.round(((tnpHoy - tnpAyer) / tnpAyer) * 100) : tnpHoy > 0 ? 100 : 0;

  // Card 4 — MTTR (promedio hhConsumidas de OF finalizadas últimos 7 días)
  const mttrHoras =
    ofFinalizadasUlt7d.length > 0
      ? ofFinalizadasUlt7d.reduce((acc, o) => acc + o.hhConsumidas, 0) / ofFinalizadasUlt7d.length
      : 0;

  // Card 5 — Alertas por nivel (convención: "info" | "warning" | "critico")
  let criticas = 0;
  let advertencias = 0;
  let info = 0;
  for (const g of alertasPorNivel) {
    const n = g._count._all;
    const nivel = g.nivel.toLowerCase();
    if (nivel === "critico" || nivel === "critical" || nivel === "critica") {
      criticas += n;
    } else if (nivel === "warning" || nivel === "advertencia") {
      advertencias += n;
    } else {
      info += n;
    }
  }

  return Response.json({
    cargaTaller: {
      porcentaje: cargaPorcentaje,
      tecnicosActivos,
      tecnicosTotal,
    },
    ofEnCurso: {
      total: ofEnProceso,
      sobreSla: ofSobreSla,
    },
    tiempoNoProductivo: {
      horas: Math.round(tnpHoy * 10) / 10,
      deltaPorcentajeAyer: deltaPctAyer,
    },
    mttr: {
      horas: Math.round(mttrHoras * 10) / 10,
      meta: MTTR_META_HORAS,
    },
    alertasActivas: {
      total: criticas + advertencias + info,
      criticas,
      advertencias,
    },
  });
}
