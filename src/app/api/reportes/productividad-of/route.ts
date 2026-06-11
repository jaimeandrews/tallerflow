import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";
import { MAX_DIAS_REPORTE, type OFProductividad } from "@/types/reportes";
import { finDelDiaUTC, horasEnRango, parseDateUTC, r0, r1 } from "@/lib/services/reportes-service";

const estadoEnum = z.enum(["PENDIENTE", "EN_PROCESO", "PAUSADA", "ESPERA_REPUESTO", "FINALIZADA"]);

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
  desde: z.iso.date(),
  hasta: z.iso.date(),
  estado: estadoEnum.optional(),
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

  const { desde, hasta, estado } = parsed.data;
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
  const ahora = Date.now();

  // Marcajes de OF en el rango (solo OF que tuvieron actividad)
  const marcajes = await prisma.marcaje.findMany({
    where: {
      ...(sucursalId ? { sucursalId } : {}),
      horaInicio: { gte: desdeDate, lte: hastaDate },
      ordenTrabajoId: { not: null },
      ...(estado ? { ordenTrabajo: { estado } } : {}),
    },
    select: {
      horaInicio: true,
      horaFin: true,
      usuarioId: true,
      ordenTrabajoId: true,
      actividad: { select: { productiva: true } },
      usuario: {
        select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
      },
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
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  // Agrupar por OF
  const byOF = new Map<
    string,
    {
      of: Exclude<(typeof marcajes)[0]["ordenTrabajo"], null>;
      marcajes: typeof marcajes;
    }
  >();

  for (const m of marcajes) {
    if (!m.ordenTrabajo || !m.ordenTrabajoId) continue;
    if (!byOF.has(m.ordenTrabajoId)) {
      byOF.set(m.ordenTrabajoId, {
        of: m.ordenTrabajo,
        marcajes: [],
      });
    }
    byOF.get(m.ordenTrabajoId)!.marcajes.push(m);
  }

  const resultado: OFProductividad[] = [];

  for (const [, { of: of_, marcajes: mks }] of byOF) {
    let hhProd = 0;
    let hhNoProd = 0;
    const byTecnico = new Map<
      string,
      {
        usuario: (typeof mks)[0]["usuario"];
        hh: number;
      }
    >();

    for (const m of mks) {
      const hh = horasEnRango(m.horaInicio, m.horaFin, desdeMs, hastaMs);
      if (m.actividad.productiva) hhProd += hh;
      else hhNoProd += hh;

      const ex = byTecnico.get(m.usuarioId);
      if (ex) ex.hh += hh;
      else byTecnico.set(m.usuarioId, { usuario: m.usuario, hh });
    }

    const desviacion = of_.hhConsumidas - of_.hhEstimadas;
    const desviacionPct = of_.hhEstimadas > 0 ? r0((desviacion / of_.hhEstimadas) * 100) : 0;
    const eficiencia = of_.hhConsumidas > 0 ? r0((of_.hhEstimadas / of_.hhConsumidas) * 100) : 0;

    // SLA status
    let slaStatus: OFProductividad["slaStatus"] = "sin_sla";
    if (of_.slaVencimiento) {
      if (of_.estado === "FINALIZADA") {
        slaStatus = of_.updatedAt <= of_.slaVencimiento ? "cumplido" : "vencido";
      } else {
        slaStatus = ahora > of_.slaVencimiento.getTime() ? "vencido" : "cumplido";
      }
    }

    // Días en proceso: desde primer marcaje hasta finalización o hoy
    const primerMarcaje = mks.reduce(
      (min, m) => (m.horaInicio < min ? m.horaInicio : min),
      mks[0].horaInicio
    );
    const finProceso = of_.estado === "FINALIZADA" ? of_.updatedAt : new Date(ahora);
    const diasEnProceso = Math.max(
      1,
      Math.ceil((finProceso.getTime() - primerMarcaje.getTime()) / 86_400_000)
    );

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
      desviacion: r1(desviacion),
      desviacionPorcentaje: desviacionPct,
      eficiencia,
      tecnicosInvolucrados: byTecnico.size,
      tiempoNoProductivo: r1(hhNoProd),
      slaStatus,
      diasEnProceso,
      desglosePorTecnico: [...byTecnico.values()].map(({ usuario, hh }) => ({
        tecnicoId: usuario.id,
        nombre: `${usuario.nombre} ${usuario.apellido}`.trim(),
        iniciales: usuario.iniciales,
        color: usuario.color,
        hh: r1(hh),
      })),
    });
  }

  resultado.sort((a, b) => b.hhConsumidas - a.hhConsumidas);
  return Response.json({ data: resultado, total: resultado.length });
}
