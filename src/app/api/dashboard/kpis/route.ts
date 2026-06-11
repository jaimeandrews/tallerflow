import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  HORAS_TURNO_DEFAULT,
  META_PRODUCTIVIDAD_DEFAULT,
  UMBRAL_NO_PRODUCTIVAS_PORCENTAJE,
  ayerMismaHora,
  calcularHHHastaCorte,
  finDelDia,
  inicioDelDia,
  resolverSucursalId,
} from "@/lib/services/dashboard-service";

const kpisQuerySchema = z.object({
  sucursalId: z.uuid().optional(),
  turnoId: z.uuid().optional(),
  fecha: z.iso.date().optional(),
});

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = kpisQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sucursalId = resolverSucursalId(user.rol, user.sucursalId, parsed.data.sucursalId);

  const ahora = parsed.data.fecha ? finDelDia(new Date(parsed.data.fecha)) : new Date();
  const inicioHoy = inicioDelDia(ahora);
  const cutoffAyer = ayerMismaHora(ahora);
  const inicioAyer = inicioDelDia(cutoffAyer);

  const tecnicosBaseWhere = {
    rol: "TECNICO" as const,
    activo: true,
    sucursalId,
  };

  const [tecnicosTotal, marcajesHoy, marcajesAyer, ofEnProceso, ofCriticas, actividadEspera] =
    await Promise.all([
      prisma.usuario.count({ where: tecnicosBaseWhere }),
      prisma.marcaje.findMany({
        where: {
          sucursalId,
          horaInicio: { gte: inicioHoy, lte: ahora },
        },
        select: {
          usuarioId: true,
          ordenTrabajoId: true,
          actividadId: true,
          horaInicio: true,
          horaFin: true,
          duracionMinutos: true,
          actividad: { select: { nombre: true, productiva: true } },
        },
      }),
      prisma.marcaje.findMany({
        where: {
          sucursalId,
          horaInicio: { gte: inicioAyer, lte: cutoffAyer },
        },
        select: {
          usuarioId: true,
          ordenTrabajoId: true,
        },
      }),
      prisma.ordenTrabajo.count({
        where: { sucursalId, eliminada: false, estado: "EN_PROCESO" },
      }),
      prisma.ordenTrabajo.count({
        where: {
          sucursalId,
          eliminada: false,
          critica: true,
          estado: { not: "FINALIZADA" },
        },
      }),
      prisma.actividad.findFirst({
        where: { nombre: "Espera repuesto" },
        select: { id: true },
      }),
    ]);

  // Técnicos activos hoy = técnicos con al menos un marcaje aún abierto
  const tecnicosActivosSet = new Set<string>();
  for (const m of marcajesHoy) {
    if (m.horaFin === null) tecnicosActivosSet.add(m.usuarioId);
  }
  const tecnicosActivos = tecnicosActivosSet.size;

  // Aproximación de técnicos activos ayer a la misma hora:
  // distinct usuarios que tuvieron marcajes durante esa ventana del día anterior
  const tecnicosAyerSet = new Set<string>();
  const ofAyerSet = new Set<string>();
  for (const m of marcajesAyer) {
    tecnicosAyerSet.add(m.usuarioId);
    if (m.ordenTrabajoId) ofAyerSet.add(m.ordenTrabajoId);
  }
  const deltaTecnicosAyer = tecnicosActivos - tecnicosAyerSet.size;

  // OF que tuvieron actividad ayer (aproxima ofEnProceso de ayer)
  const ofConMarcajeAyer = ofAyerSet.size;
  const deltaOfAyer = ofEnProceso - ofConMarcajeAyer;

  // HH del día calculadas en tiempo real (marcajes activos = ahora - horaInicio)
  const hh = calcularHHHastaCorte(marcajesHoy, ahora);
  const hhProductivas = hh.productivas;
  const hhNoProductivas = hh.noProductivas;
  const hhDisponibles = tecnicosTotal * HORAS_TURNO_DEFAULT;
  const productividadHoy = hh.total > 0 ? Math.round((hhProductivas / hh.total) * 100) : 0;

  const hhSobreUmbral =
    hhDisponibles > 0 && hhNoProductivas > (hhDisponibles * UMBRAL_NO_PRODUCTIVAS_PORCENTAJE) / 100;

  // Técnicos detenidos = marcaje aún abierto con actividad "Espera repuesto".
  // Se computa desde marcajesHoy (ya fetched) → elimina un round-trip a la DB.
  const tecnicosDetenidosSet = new Set<string>();
  if (actividadEspera) {
    for (const m of marcajesHoy) {
      if (m.horaFin === null && m.actividadId === actividadEspera.id) {
        tecnicosDetenidosSet.add(m.usuarioId);
      }
    }
  }

  const disponibilidad =
    tecnicosTotal > 0 ? Math.round((tecnicosActivos / tecnicosTotal) * 100) : 0;

  return Response.json({
    tecnicosActivos,
    tecnicosTotal,
    disponibilidad,
    deltaTecnicosAyer,

    ofEnProceso,
    deltaOfAyer,

    productividadHoy,
    metaProductividad: META_PRODUCTIVIDAD_DEFAULT,

    hhProductivas: Math.round(hhProductivas * 10) / 10,
    hhNoProductivas: Math.round(hhNoProductivas * 10) / 10,
    hhDisponibles,
    hhSobreUmbral,

    ofCriticas,
    tecnicosDetenidos: tecnicosDetenidosSet.size,
  });
}
