/**
 * Exportación de reportes en CSV y PDF.
 *
 * CSV: genera el archivo en stream sin librerías externas.
 *      - BOM UTF-8 para compatibilidad con Excel en español
 *      - Separador ; (punto y coma)
 * PDF: usa @react-pdf/renderer con renderToBuffer() (server-side, sin canvas).
 *
 * El endpoint primero obtiene los datos via las mismas funciones del servicio
 * que los endpoints individuales (sin duplicar lógica de BD).
 */

import { type NextRequest } from "next/server";
import { createElement } from "react";
import ReactPDF from "@react-pdf/renderer";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";
import {
  MAX_DIAS_EXPORTAR,
  ROLES_SUCURSAL_REPORT,
  type DesgloseActividad,
  type OFProductividad,
  type SucursalProductividad,
  type TecnicoProductividad,
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
  csvRow,
  ymd,
} from "@/lib/services/reportes-service";
import { ReportePDF } from "@/lib/pdf/reporte-pdf";

const querySchema = z.object({
  tipo: z.enum(["tecnicos", "ordenes", "sucursales"]),
  formato: z.enum(["csv", "pdf"]),
  desde: z.iso.date(),
  hasta: z.iso.date(),
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

  const { tipo, formato, desde, hasta } = parsed.data;

  if (tipo === "sucursales" && !ROLES_SUCURSAL_REPORT.includes(user.rol)) {
    return Response.json(
      { error: "Sin permisos para exportar reporte de sucursales" },
      { status: 403 }
    );
  }

  const desdeDate = parseDateUTC(desde);
  const hastaDate = finDelDiaUTC(hasta);
  if (Math.ceil((hastaDate.getTime() - desdeDate.getTime()) / 86_400_000) > MAX_DIAS_EXPORTAR) {
    return Response.json(
      { error: `El rango no puede superar ${MAX_DIAS_EXPORTAR} días para exportar` },
      { status: 400 }
    );
  }

  let sucursalId: string | undefined;
  if (aplicaFiltroSucursal(user.rol)) {
    sucursalId = user.sucursalId;
  } else {
    sucursalId = parsed.data.sucursalId;
  }

  // Nombre de la sucursal para el PDF
  let sucursalNombre = "Todas las sucursales";
  if (sucursalId) {
    const suc = await prisma.sucursal.findUnique({
      where: { id: sucursalId },
      select: { nombre: true },
    });
    if (suc) sucursalNombre = suc.nombre;
  }

  const desdeMs = desdeDate.getTime();
  const hastaMs = hastaDate.getTime();
  const fechas = rango(desdeDate, hastaDate);
  const filename = `reporte-${tipo}-${desde}-${hasta}`;

  // ── Obtener datos según tipo ─────────────────────────────────────────────

  let dataTecnicos: TecnicoProductividad[] = [];
  let dataOF: OFProductividad[] = [];
  let dataSucursales: SucursalProductividad[] = [];

  if (tipo === "tecnicos") {
    dataTecnicos = await fetchTecnicos({
      sucursalId,
      desdeDate,
      hastaDate,
      desdeMs,
      hastaMs,
      fechas,
    });
  } else if (tipo === "ordenes") {
    dataOF = await fetchOF({ sucursalId, desdeDate, hastaDate, desdeMs, hastaMs });
  } else {
    dataSucursales = await fetchSucursales({
      desdeDate,
      hastaDate,
      desdeMs,
      hastaMs,
      fechas,
      userId: user.id,
      userRol: user.rol,
      userSucursalId: user.sucursalId,
    });
  }

  // ── CSV ──────────────────────────────────────────────────────────────────

  if (formato === "csv") {
    const csv = generarCSV(tipo, dataTecnicos, dataOF, dataSucursales);
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  }

  // ── PDF ──────────────────────────────────────────────────────────────────

  const titulos: Record<string, string> = {
    tecnicos: "Productividad por Técnico",
    ordenes: "Productividad por Orden de Trabajo",
    sucursales: "Productividad por Sucursal",
  };

  const element = createElement(ReportePDF, {
    tipo,
    titulo: titulos[tipo],
    desde,
    hasta,
    sucursal: sucursalNombre,
    usuarioNombre: user.nombre,
    dataTecnicos,
    dataOF,
    dataSucursales,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await ReactPDF.renderToBuffer(element as any);
  // Buffer (Node.js) extends Uint8Array — Response acepta Uint8Array
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}.pdf"`,
    },
  });
}

// ── Helpers de datos ─────────────────────────────────────────────────────

async function fetchTecnicos({
  sucursalId,
  desdeDate,
  hastaDate,
  desdeMs,
  hastaMs,
  fechas,
}: {
  sucursalId?: string;
  desdeDate: Date;
  hastaDate: Date;
  desdeMs: number;
  hastaMs: number;
  fechas: string[];
}): Promise<TecnicoProductividad[]> {
  const marcajes = await prisma.marcaje.findMany({
    where: {
      ...(sucursalId ? { sucursalId } : {}),
      horaInicio: { gte: desdeDate, lte: hastaDate },
      usuario: { rol: "TECNICO" },
    },
    select: {
      usuarioId: true,
      horaInicio: true,
      horaFin: true,
      ordenTrabajoId: true,
      actividad: { select: { id: true, nombre: true, color: true, productiva: true } },
      usuario: { select: { nombre: true, apellido: true, iniciales: true, color: true } },
    },
  });

  const byUser = new Map<
    string,
    { usuario: (typeof marcajes)[0]["usuario"]; mks: typeof marcajes }
  >();
  for (const m of marcajes) {
    if (!byUser.has(m.usuarioId)) byUser.set(m.usuarioId, { usuario: m.usuario, mks: [] });
    byUser.get(m.usuarioId)!.mks.push(m);
  }

  const resultado: TecnicoProductividad[] = [];
  for (const [id, { usuario, mks }] of byUser) {
    let hhProd = 0;
    let hhNoProd = 0;
    const diasSet = new Set<string>();
    const ofSet = new Set<string>();
    const byAct = new Map<string, { actividad: (typeof mks)[0]["actividad"]; hh: number }>();
    for (const m of mks) {
      const hh = horasEnRango(m.horaInicio, m.horaFin, desdeMs, hastaMs);
      if (m.actividad.productiva) hhProd += hh;
      else hhNoProd += hh;
      diasSet.add(ymd(m.horaInicio));
      if (m.ordenTrabajoId) ofSet.add(m.ordenTrabajoId);
      const ex = byAct.get(m.actividad.id);
      if (ex) ex.hh += hh;
      else byAct.set(m.actividad.id, { actividad: m.actividad, hh });
    }
    const hhTotal = hhProd + hhNoProd;
    let actPrincipal = "—";
    let maxHH = 0;
    const desglose: DesgloseActividad[] = [];
    for (const [, { actividad, hh }] of byAct) {
      desglose.push({
        actividadId: actividad.id,
        nombre: actividad.nombre,
        color: actividad.color,
        productiva: actividad.productiva,
        hh: r1(hh),
        porcentaje: hhTotal > 0 ? r0((hh / hhTotal) * 100) : 0,
      });
      if (hh > maxHH) {
        maxHH = hh;
        actPrincipal = actividad.nombre;
      }
    }
    const dt = diasSet.size;
    resultado.push({
      tecnicoId: id,
      nombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
      iniciales: usuario.iniciales,
      color: usuario.color,
      hhProductivas: r1(hhProd),
      hhNoProductivas: r1(hhNoProd),
      hhTotal: r1(hhTotal),
      productividad: hhTotal > 0 ? r0((hhProd / hhTotal) * 100) : 0,
      diasTrabajados: dt,
      promedioHHDia: dt > 0 ? r1(hhTotal / dt) : 0,
      actividadPrincipal: actPrincipal,
      ofAtendidas: ofSet.size,
      desglosePorActividad: desglose.sort((a, b) => b.hh - a.hh),
      tendencia: tendencia(mks, fechas, hastaMs),
    });
  }
  return resultado.sort((a, b) => b.productividad - a.productividad);
}

async function fetchOF({
  sucursalId,
  desdeDate,
  hastaDate,
  desdeMs,
  hastaMs,
}: {
  sucursalId?: string;
  desdeDate: Date;
  hastaDate: Date;
  desdeMs: number;
  hastaMs: number;
}): Promise<OFProductividad[]> {
  const marcajes = await prisma.marcaje.findMany({
    where: {
      ...(sucursalId ? { sucursalId } : {}),
      horaInicio: { gte: desdeDate, lte: hastaDate },
      ordenTrabajoId: { not: null },
    },
    select: {
      horaInicio: true,
      horaFin: true,
      usuarioId: true,
      ordenTrabajoId: true,
      actividad: { select: { productiva: true } },
      usuario: { select: { id: true, nombre: true, apellido: true, iniciales: true, color: true } },
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
          slaVencimiento: true,
          updatedAt: true,
        },
      },
    },
  });
  const byOF = new Map<
    string,
    { of: Exclude<(typeof marcajes)[0]["ordenTrabajo"], null>; mks: typeof marcajes }
  >();
  for (const m of marcajes) {
    if (!m.ordenTrabajo || !m.ordenTrabajoId) continue;
    if (!byOF.has(m.ordenTrabajoId)) byOF.set(m.ordenTrabajoId, { of: m.ordenTrabajo, mks: [] });
    byOF.get(m.ordenTrabajoId)!.mks.push(m);
  }
  const resultado: OFProductividad[] = [];
  const ahora = Date.now();
  for (const [, { of: of_, mks }] of byOF) {
    let hhNoProd = 0;
    const byTec = new Map<string, { u: (typeof mks)[0]["usuario"]; hh: number }>();
    for (const m of mks) {
      const hh = horasEnRango(m.horaInicio, m.horaFin, desdeMs, hastaMs);
      if (!m.actividad.productiva) hhNoProd += hh;
      const ex = byTec.get(m.usuarioId);
      if (ex) ex.hh += hh;
      else byTec.set(m.usuarioId, { u: m.usuario, hh });
    }
    let slaStatus: OFProductividad["slaStatus"] = "sin_sla";
    if (of_.slaVencimiento)
      slaStatus = (
        of_.estado === "FINALIZADA"
          ? of_.updatedAt <= of_.slaVencimiento
          : ahora <= of_.slaVencimiento.getTime()
      )
        ? "cumplido"
        : "vencido";
    const primerM = mks.reduce(
      (min, m) => (m.horaInicio < min ? m.horaInicio : min),
      mks[0].horaInicio
    );
    const finP = of_.estado === "FINALIZADA" ? of_.updatedAt : new Date(ahora);
    const desv = of_.hhConsumidas - of_.hhEstimadas;
    resultado.push({
      ofId: of_.id,
      numero: of_.numero,
      nombre: of_.nombre,
      cliente: of_.cliente,
      equipo: of_.equipo,
      estado: of_.estado,
      prioridad: of_.prioridad,
      hhEstimadas: of_.hhEstimadas,
      hhConsumidas: r1(of_.hhConsumidas),
      desviacion: r1(desv),
      desviacionPorcentaje: of_.hhEstimadas > 0 ? r0((desv / of_.hhEstimadas) * 100) : 0,
      eficiencia: of_.hhConsumidas > 0 ? r0((of_.hhEstimadas / of_.hhConsumidas) * 100) : 0,
      tecnicosInvolucrados: byTec.size,
      tiempoNoProductivo: r1(hhNoProd),
      slaStatus,
      diasEnProceso: Math.max(1, Math.ceil((finP.getTime() - primerM.getTime()) / 86_400_000)),
      desglosePorTecnico: [...byTec.values()].map(({ u, hh }) => ({
        tecnicoId: u.id,
        nombre: `${u.nombre} ${u.apellido}`.trim(),
        iniciales: u.iniciales,
        color: u.color,
        hh: r1(hh),
      })),
    });
  }
  return resultado.sort((a, b) => b.hhConsumidas - a.hhConsumidas);
}

async function fetchSucursales({
  desdeDate,
  hastaDate,
  desdeMs,
  hastaMs,
  fechas,
  userRol,
  userSucursalId,
}: {
  desdeDate: Date;
  hastaDate: Date;
  desdeMs: number;
  hastaMs: number;
  fechas: string[];
  userId: string;
  userRol: string;
  userSucursalId: string;
}): Promise<SucursalProductividad[]> {
  const sucursalWhere = userRol === "ADMIN" ? {} : { id: userSucursalId };
  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true, ...sucursalWhere },
    select: { id: true, nombre: true },
  });
  const diasLab = diasLaborales(desdeDate, hastaDate);
  const resultado: SucursalProductividad[] = [];
  await Promise.all(
    sucursales.map(async (suc) => {
      const [tecActivos, marcajes, ofData] = await Promise.all([
        prisma.usuario.count({ where: { sucursalId: suc.id, rol: "TECNICO", activo: true } }),
        prisma.marcaje.findMany({
          where: { sucursalId: suc.id, horaInicio: { gte: desdeDate, lte: hastaDate } },
          select: { horaInicio: true, horaFin: true, actividad: { select: { productiva: true } } },
        }),
        prisma.ordenTrabajo.findMany({
          where: { sucursalId: suc.id, eliminada: false },
          select: { estado: true, hhConsumidas: true, slaVencimiento: true, updatedAt: true },
        }),
      ]);
      let hhP = 0;
      let hhNP = 0;
      for (const m of marcajes) {
        const hh = horasEnRango(m.horaInicio, m.horaFin, desdeMs, hastaMs);
        if (m.actividad.productiva) hhP += hh;
        else hhNP += hh;
      }
      const hhTotal = hhP + hhNP;
      const cap = tecActivos * 8 * diasLab;
      const ofFin = ofData.filter((o) => o.estado === "FINALIZADA");
      const ofCSla = ofFin.filter((o) => o.slaVencimiento);
      resultado.push({
        sucursalId: suc.id,
        nombre: suc.nombre,
        tecnicosActivos: tecActivos,
        ofTotal: ofData.length,
        ofFinalizadas: ofFin.length,
        hhProductivas: r1(hhP),
        hhNoProductivas: r1(hhNP),
        productividad: hhTotal > 0 ? r0((hhP / hhTotal) * 100) : 0,
        utilizacion: cap > 0 ? r0((hhTotal / cap) * 100) : 0,
        mttr:
          ofFin.length > 0 ? r1(ofFin.reduce((a, o) => a + o.hhConsumidas, 0) / ofFin.length) : 0,
        slaCumplimiento:
          ofCSla.length > 0
            ? r0(
                (ofCSla.filter((o) => o.slaVencimiento && o.updatedAt <= o.slaVencimiento).length /
                  ofCSla.length) *
                  100
              )
            : 100,
        tendencia: tendencia(marcajes, fechas, hastaMs),
      });
    })
  );
  return resultado.sort((a, b) => b.productividad - a.productividad);
}

// ── CSV generator ────────────────────────────────────────────────────────

function generarCSV(
  tipo: string,
  tecnicos: TecnicoProductividad[],
  of: OFProductividad[],
  sucursales: SucursalProductividad[]
): string {
  const rows: string[] = [];

  if (tipo === "tecnicos") {
    rows.push(
      csvRow([
        "Técnico",
        "Iniciales",
        "HH Productivas",
        "HH No Productivas",
        "HH Total",
        "Productividad %",
        "Días Trabajados",
        "Prom. HH/día",
        "Actividad Principal",
        "OF Atendidas",
      ])
    );
    for (const t of tecnicos) {
      rows.push(
        csvRow([
          t.nombre,
          t.iniciales,
          t.hhProductivas,
          t.hhNoProductivas,
          t.hhTotal,
          t.productividad,
          t.diasTrabajados,
          t.promedioHHDia,
          t.actividadPrincipal,
          t.ofAtendidas,
        ])
      );
    }
  } else if (tipo === "ordenes") {
    rows.push(
      csvRow([
        "OF",
        "Nombre",
        "Cliente",
        "Equipo",
        "Estado",
        "Prioridad",
        "HH Estimadas",
        "HH Consumidas",
        "Desviación",
        "Desviación %",
        "Eficiencia %",
        "Técnicos",
        "T. No Prod. (h)",
        "SLA",
        "Días en Proceso",
      ])
    );
    for (const o of of) {
      rows.push(
        csvRow([
          o.numero,
          o.nombre,
          o.cliente,
          o.equipo,
          o.estado,
          o.prioridad,
          o.hhEstimadas,
          o.hhConsumidas,
          o.desviacion,
          o.desviacionPorcentaje,
          o.eficiencia,
          o.tecnicosInvolucrados,
          o.tiempoNoProductivo,
          o.slaStatus,
          o.diasEnProceso,
        ])
      );
    }
  } else {
    rows.push(
      csvRow([
        "Sucursal",
        "Técnicos Activos",
        "OF Total",
        "OF Finalizadas",
        "HH Productivas",
        "HH No Productivas",
        "Productividad %",
        "Utilización %",
        "MTTR (h)",
        "SLA Cumplimiento %",
      ])
    );
    for (const s of sucursales) {
      rows.push(
        csvRow([
          s.nombre,
          s.tecnicosActivos,
          s.ofTotal,
          s.ofFinalizadas,
          s.hhProductivas,
          s.hhNoProductivas,
          s.productividad,
          s.utilizacion,
          s.mttr,
          s.slaCumplimiento,
        ])
      );
    }
  }

  return rows.join("\r\n");
}
