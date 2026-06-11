import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";
import { MAX_DIAS_REPORTE, type ResumenPeriodo } from "@/types/reportes";
import {
  finDelDiaUTC,
  horasEnRango,
  parseDateUTC,
  productivodiadDesde,
  r0,
  r1,
  rango,
  ymd,
} from "@/lib/services/reportes-service";

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

  const desdeMs = desdeDate.getTime();
  const hastaMs = hastaDate.getTime();
  const fechas = rango(desdeDate, hastaDate);

  const [marcajes, ofData] = await Promise.all([
    prisma.marcaje.findMany({
      where: {
        ...(sucursalId ? { sucursalId } : {}),
        horaInicio: { gte: desdeDate, lte: hastaDate },
        usuario: { rol: "TECNICO" },
      },
      select: {
        usuarioId: true,
        horaInicio: true,
        horaFin: true,
        actividad: {
          select: { id: true, nombre: true, productiva: true },
        },
        usuario: {
          select: { nombre: true, apellido: true },
        },
      },
    }),
    prisma.ordenTrabajo.findMany({
      where: {
        ...(sucursalId ? { sucursalId } : {}),
        eliminada: false,
        createdAt: { lte: hastaDate },
      },
      select: {
        estado: true,
        hhEstimadas: true,
        hhConsumidas: true,
        slaVencimiento: true,
        updatedAt: true,
        createdAt: true,
      },
    }),
  ]);

  // HH totales
  let totalHHProd = 0;
  let totalHHNoProd = 0;
  const hhPorUsuario = new Map<string, { nombre: string; hhProd: number; hhTotal: number }>();
  const hhPorActividad = new Map<string, { nombre: string; hh: number }>();

  for (const m of marcajes) {
    const hh = horasEnRango(m.horaInicio, m.horaFin, desdeMs, hastaMs);
    if (m.actividad.productiva) totalHHProd += hh;
    else totalHHNoProd += hh;

    const u = hhPorUsuario.get(m.usuarioId);
    if (u) {
      u.hhTotal += hh;
      if (m.actividad.productiva) u.hhProd += hh;
    } else {
      hhPorUsuario.set(m.usuarioId, {
        nombre: `${m.usuario.nombre} ${m.usuario.apellido}`.trim(),
        hhProd: m.actividad.productiva ? hh : 0,
        hhTotal: hh,
      });
    }

    const a = hhPorActividad.get(m.actividad.id);
    if (a) a.hh += hh;
    else hhPorActividad.set(m.actividad.id, { nombre: m.actividad.nombre, hh });
  }

  const totalHH = totalHHProd + totalHHNoProd;
  const productividadPromedio = totalHH > 0 ? r0((totalHHProd / totalHH) * 100) : 0;

  // Técnico más/menos productivo (mínimo 1h total)
  const tecnicos = [...hhPorUsuario.values()].filter((t) => t.hhTotal >= 1);
  tecnicos.sort((a, b) => b.hhProd / Math.max(b.hhTotal, 1) - a.hhProd / Math.max(a.hhTotal, 1));

  const tecMas = tecnicos[0] ?? null;
  const tecMenos = tecnicos[tecnicos.length - 1] ?? null;

  // Actividad de más consumo
  const actividadTop = [...hhPorActividad.values()].sort((a, b) => b.hh - a.hh)[0] ?? null;

  // Día max/min productividad (días con marcajes)
  let diaMax: { fecha: string; productividad: number } | null = null;
  let diaMin: { fecha: string; productividad: number } | null = null;

  for (const fecha of fechas) {
    const dayMs = new Date(`${fecha}T00:00:00.000Z`).getTime();
    const dayMarcajes = marcajes.filter(
      (m) => m.horaInicio.getTime() >= dayMs && m.horaInicio.getTime() < dayMs + 86_400_000
    );
    if (dayMarcajes.length === 0) continue;
    const pct = productivodiadDesde(dayMarcajes, fecha, hastaMs);
    if (!diaMax || pct > diaMax.productividad) diaMax = { fecha, productividad: pct };
    if (!diaMin || pct < diaMin.productividad) diaMin = { fecha, productividad: pct };
  }

  // OF stats
  const ofCreadas = ofData.filter((o) => o.createdAt >= desdeDate).length;
  const ofFinalizadas = ofData.filter((o) => o.estado === "FINALIZADA").length;
  const ofPendientes = ofData.filter((o) =>
    ["PENDIENTE", "EN_PROCESO", "PAUSADA", "ESPERA_REPUESTO"].includes(o.estado)
  ).length;

  // MTTR
  const ofFin = ofData.filter((o) => o.estado === "FINALIZADA");
  const mttr =
    ofFin.length > 0 ? r1(ofFin.reduce((a, o) => a + o.hhConsumidas, 0) / ofFin.length) : 0;

  // SLA cumplimiento
  const ofConSla = ofFin.filter((o) => o.slaVencimiento);
  const slaCumplimiento =
    ofConSla.length > 0
      ? r0(
          (ofConSla.filter((o) => o.slaVencimiento && o.updatedAt <= o.slaVencimiento).length /
            ofConSla.length) *
            100
        )
      : 100;

  const resumen: ResumenPeriodo = {
    totalHHProductivas: r1(totalHHProd),
    totalHHNoProductivas: r1(totalHHNoProd),
    totalHH: r1(totalHH),
    productividadPromedio,
    ofCreadas,
    ofFinalizadas,
    ofPendientes,
    tecnicoMasProductivo: tecMas
      ? {
          nombre: tecMas.nombre,
          hh: r1(tecMas.hhProd),
          productividad: r0((tecMas.hhProd / Math.max(tecMas.hhTotal, 0.01)) * 100),
        }
      : null,
    tecnicoMenosProductivo:
      tecnicos.length > 1 && tecMenos
        ? {
            nombre: tecMenos.nombre,
            hh: r1(tecMenos.hhProd),
            productividad: r0((tecMenos.hhProd / Math.max(tecMenos.hhTotal, 0.01)) * 100),
          }
        : null,
    actividadMasConsumo: actividadTop
      ? { nombre: actividadTop.nombre, hh: r1(actividadTop.hh) }
      : null,
    diaMaxProductividad: diaMax,
    diaMinProductividad: diaMin,
    slaCumplimiento,
    mttrPromedio: mttr,
  };

  return Response.json(resumen);
}
