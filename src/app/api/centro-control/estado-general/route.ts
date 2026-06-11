/**
 * Aggregator: devuelve todo lo que el centro de control necesita en un solo
 * roundtrip — tecnicos, ofActivas (con segmentos del ribbon), alertas,
 * mixActividad y kpis.
 *
 * Las consultas son inline porque el código sigue la misma lógica que los
 * 5 endpoints individuales (kpis, of-ribbon, mix-actividad, alertas-activas,
 * tecnicos-en-taller). Si se necesita compartir, extraer a un service.
 */

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  ayerMismaHora,
  calcularHHHastaCorte,
  diasAtras,
  ESTADO_TECNICO_PRIORIDAD,
  inicioDelDia,
  obtenerEstadoTecnico,
  resolverSucursalId,
} from "@/lib/services/dashboard-service";
import { ESTADO_OF_COLORS, ESTADO_OF_LABELS } from "@/lib/utils/constants";
import type { CentroControlKpis, NivelAlerta, SegmentoTipo } from "@/types/centro-control";
import type { TipoMarcaje } from "@/generated/prisma";

const MTTR_DIAS = 7;
const MTTR_META_HORAS = 8;
const HORA_RANGO_INICIO = 7;
const HORA_RANGO_FIN = 18;
const RIBBON_LIMITE = 8;
const ALERTAS_LIMITE = 20;
const COLOR_DEFAULT = "#94A3B8";

const COLOR_POR_ACTIVIDAD: Record<string, string> = {
  Reparación: "#00AEEF",
  Diagnóstico: "#0090CC",
  Garantía: "#F47920",
  "Aseo taller": "#6E7278",
  Aseo: "#6E7278",
  Reunión: "#4A4D52",
  Almuerzo: "#F4A91A",
  "Espera repuesto": "#E82C2C",
};

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
});

function clasificarSegmento(
  tipo: TipoMarcaje,
  actividad: { nombre: string; productiva: boolean }
): { tipo: SegmentoTipo; color: string } {
  if (tipo === "PAUSA") return { tipo: "pausa", color: "#F4A91A" };
  if (actividad.nombre === "Espera repuesto") return { tipo: "espera_repuesto", color: "#E82C2C" };
  if (actividad.productiva) return { tipo: "trabajando", color: "#00AEEF" };
  return { tipo: "otro", color: "#6E7278" };
}

function normalizarNivel(raw: string): NivelAlerta {
  const n = raw.toLowerCase();
  if (n === "critico" || n === "critical" || n === "critica") return "critico";
  if (n === "warning" || n === "advertencia") return "warning";
  return "info";
}

function parseDatos(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

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
  const rangoInicio = new Date(ahora);
  rangoInicio.setHours(HORA_RANGO_INICIO, 0, 0, 0);
  const rangoFin = new Date(ahora);
  rangoFin.setHours(HORA_RANGO_FIN, 0, 0, 0);

  const [
    tecnicosTotal,
    tecnicosFull,
    marcajesHoy,
    marcajesAyer,
    ofEnProceso,
    ofSobreSlaCount,
    ofFinalizadasUlt7d,
    alertasPorNivel,
    ofRibbonRaw,
    marcajesMix,
    alertasRaw,
  ] = await Promise.all([
    prisma.usuario.count({ where: { rol: "TECNICO", activo: true, sucursalId } }),
    prisma.usuario.findMany({
      where: { rol: "TECNICO", activo: true, sucursalId },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        iniciales: true,
        color: true,
        marcajes: {
          take: 1,
          orderBy: { horaInicio: "desc" },
          select: {
            tipo: true,
            horaInicio: true,
            horaFin: true,
            actividad: { select: { id: true, nombre: true, color: true, productiva: true } },
            ordenTrabajo: { select: { id: true, numero: true, nombre: true } },
          },
        },
      },
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
    prisma.ordenTrabajo.findMany({
      where: {
        sucursalId,
        eliminada: false,
        estado: { in: ["EN_PROCESO", "PAUSADA", "ESPERA_REPUESTO"] },
        marcajes: { some: { horaInicio: { gte: rangoInicio } } },
      },
      orderBy: { updatedAt: "desc" },
      take: RIBBON_LIMITE,
      select: {
        id: true,
        numero: true,
        nombre: true,
        estado: true,
        marcajes: {
          where: { horaInicio: { gte: rangoInicio } },
          orderBy: { horaInicio: "asc" },
          select: {
            tipo: true,
            horaInicio: true,
            horaFin: true,
            actividad: { select: { nombre: true, productiva: true } },
          },
        },
      },
    }),
    prisma.marcaje.findMany({
      where: { sucursalId, horaInicio: { gte: inicioHoy, lte: ahora } },
      select: {
        horaInicio: true,
        horaFin: true,
        actividad: { select: { id: true, nombre: true, productiva: true } },
      },
    }),
    prisma.alerta.findMany({
      where: { sucursalId, resuelta: false },
      orderBy: { createdAt: "desc" },
      take: ALERTAS_LIMITE * 3,
      select: {
        id: true,
        titulo: true,
        descripcion: true,
        nivel: true,
        configuracionSlaId: true,
        datos: true,
        createdAt: true,
      },
    }),
  ]);

  // ── Tecnicos (en el shape de useTecnicosEnTaller) ─────────────────────────
  const ahoraMs = ahora.getTime();
  const tecnicos = tecnicosFull.map((t) => {
    const ultimo = t.marcajes[0] ?? null;
    const estado = obtenerEstadoTecnico(ultimo);
    const tieneActivo = !!ultimo && ultimo.horaFin === null;
    return {
      id: t.id,
      nombre: `${t.nombre} ${t.apellido}`.trim(),
      iniciales: t.iniciales,
      color: t.color,
      estado,
      actividad: tieneActivo ? ultimo!.actividad.nombre : null,
      ofActiva: tieneActivo ? (ultimo!.ordenTrabajo?.numero ?? null) : null,
      inicio: tieneActivo ? ultimo!.horaInicio.toISOString() : null,
      duracionSegundos: tieneActivo
        ? Math.max(0, Math.floor((ahoraMs - ultimo!.horaInicio.getTime()) / 1000))
        : null,
    };
  });
  tecnicos.sort((a, b) => {
    const dp = ESTADO_TECNICO_PRIORIDAD[a.estado] - ESTADO_TECNICO_PRIORIDAD[b.estado];
    if (dp !== 0) return dp;
    return a.nombre.localeCompare(b.nombre, "es");
  });

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const tecnicosActivosSet = new Set<string>();
  for (const m of marcajesHoy) {
    if (m.horaFin === null) tecnicosActivosSet.add(m.usuarioId);
  }
  const tecnicosActivos = tecnicosActivosSet.size;
  const cargaPct = tecnicosTotal > 0 ? Math.round((tecnicosActivos / tecnicosTotal) * 100) : 0;

  const hhHoy = calcularHHHastaCorte(marcajesHoy, ahora);
  const hhAyer = calcularHHHastaCorte(marcajesAyer, cutoffAyer);
  const tnpHoy = hhHoy.noProductivas;
  const tnpAyer = hhAyer.noProductivas;
  const deltaPctAyer =
    tnpAyer > 0 ? Math.round(((tnpHoy - tnpAyer) / tnpAyer) * 100) : tnpHoy > 0 ? 100 : 0;

  const mttrHoras =
    ofFinalizadasUlt7d.length > 0
      ? ofFinalizadasUlt7d.reduce((acc, o) => acc + o.hhConsumidas, 0) / ofFinalizadasUlt7d.length
      : 0;

  let criticas = 0;
  let advertencias = 0;
  let info = 0;
  for (const g of alertasPorNivel) {
    const n = g._count._all;
    const nivel = normalizarNivel(g.nivel);
    if (nivel === "critico") criticas += n;
    else if (nivel === "warning") advertencias += n;
    else info += n;
  }

  const kpis: CentroControlKpis = {
    cargaTaller: {
      porcentaje: cargaPct,
      tecnicosActivos,
      tecnicosTotal,
    },
    ofEnCurso: {
      total: ofEnProceso,
      sobreSla: ofSobreSlaCount,
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
  };

  // ── OF ribbon ─────────────────────────────────────────────────────────────
  const ofActivas = ofRibbonRaw.map((of) => ({
    id: of.id,
    numero: of.numero,
    nombre: of.nombre,
    estado: of.estado,
    estadoLabel: ESTADO_OF_LABELS[of.estado],
    estadoColorClass: ESTADO_OF_COLORS[of.estado],
    segmentos: of.marcajes.map((m) => {
      const cfg = clasificarSegmento(m.tipo, m.actividad);
      return {
        inicio: m.horaInicio.toISOString(),
        fin: m.horaFin ? m.horaFin.toISOString() : null,
        tipo: cfg.tipo,
        color: cfg.color,
        actividadNombre: m.actividad.nombre,
      };
    }),
  }));

  // ── Mix actividad ─────────────────────────────────────────────────────────
  const agg = new Map<string, { id: string; nombre: string; productiva: boolean; horas: number }>();
  for (const m of marcajesMix) {
    const inicio = m.horaInicio.getTime();
    const fin = m.horaFin ? m.horaFin.getTime() : ahoraMs;
    if (fin <= inicio) continue;
    const horas = (fin - inicio) / 3_600_000;
    const ex = agg.get(m.actividad.id);
    if (ex) ex.horas += horas;
    else
      agg.set(m.actividad.id, {
        id: m.actividad.id,
        nombre: m.actividad.nombre,
        productiva: m.actividad.productiva,
        horas,
      });
  }
  const mixLista = [...agg.values()];
  const totalHorasMix = mixLista.reduce((acc, a) => acc + a.horas, 0);
  const mixActividad = mixLista
    .map((a) => ({
      actividadId: a.id,
      actividadNombre: a.nombre,
      productiva: a.productiva,
      horas: Math.round(a.horas * 10) / 10,
      porcentaje: totalHorasMix > 0 ? Math.round((a.horas / totalHorasMix) * 100) : 0,
      color: COLOR_POR_ACTIVIDAD[a.nombre] ?? COLOR_DEFAULT,
    }))
    .sort((a, b) => b.horas - a.horas);
  const productivasHrs = mixLista.filter((a) => a.productiva).reduce((acc, a) => acc + a.horas, 0);
  const productivasPct = totalHorasMix > 0 ? Math.round((productivasHrs / totalHorasMix) * 100) : 0;

  // ── Alertas activas ───────────────────────────────────────────────────────
  const NIVEL_ORDER: Record<NivelAlerta, number> = {
    critico: 0,
    warning: 1,
    info: 2,
  };
  const alertas = alertasRaw
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      descripcion: a.descripcion,
      nivel: normalizarNivel(a.nivel),
      configuracionSlaId: a.configuracionSlaId,
      datos: parseDatos(a.datos),
      createdAt: a.createdAt.toISOString(),
    }))
    .sort((x, y) => {
      const dn = NIVEL_ORDER[x.nivel] - NIVEL_ORDER[y.nivel];
      if (dn !== 0) return dn;
      return y.createdAt.localeCompare(x.createdAt);
    })
    .slice(0, ALERTAS_LIMITE);

  return Response.json({
    tecnicos,
    ofActivas: {
      ordenes: ofActivas,
      rangoInicio: rangoInicio.toISOString(),
      rangoFin: rangoFin.toISOString(),
    },
    alertas,
    mixActividad: {
      segmentos: mixActividad,
      totalHoras: Math.round(totalHorasMix * 10) / 10,
      productivasPct,
      noProductivasPct: totalHorasMix > 0 ? Math.max(0, 100 - productivasPct) : 0,
    },
    kpis,
  });
}
