import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { clasificarSla, resolverSucursalId } from "@/lib/services/dashboard-service";
import {
  ESTADO_OF_COLORS,
  ESTADO_OF_DOT_COLORS,
  ESTADO_OF_LABELS,
  PRIORIDAD_OF_LABELS,
  PRIORIDAD_OF_ORDER,
} from "@/lib/utils/constants";

const queryShape = z.object({
  sucursalId: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(50).default(5),
});

const SLA_ORDER: Record<"vencida" | "warning" | "ok", number> = {
  vencida: 0,
  warning: 1,
  ok: 2,
};

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = queryShape.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sucursalId = resolverSucursalId(user.rol, user.sucursalId, parsed.data.sucursalId);
  const { limite } = parsed.data;

  const ordenes = await prisma.ordenTrabajo.findMany({
    where: {
      sucursalId,
      eliminada: false,
      estado: { not: "FINALIZADA" },
      OR: [{ critica: true }, { estado: "PAUSADA" }, { estado: "ESPERA_REPUESTO" }],
    },
    select: {
      id: true,
      numero: true,
      nombre: true,
      proyecto: true,
      cliente: true,
      equipo: true,
      estado: true,
      prioridad: true,
      hhEstimadas: true,
      hhConsumidas: true,
      slaVencimiento: true,
      critica: true,
      asignaciones: {
        where: { activa: true },
        select: {
          usuario: {
            select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
          },
        },
      },
    },
  });

  const ahora = new Date();

  const items = ordenes.map((of) => {
    const { status, delta } = clasificarSla(of.slaVencimiento, ahora);
    const porcentajeHH =
      of.hhEstimadas > 0 ? Math.min(999, Math.round((of.hhConsumidas / of.hhEstimadas) * 100)) : 0;

    return {
      id: of.id,
      numero: of.numero,
      nombre: of.nombre,
      proyecto: of.proyecto,
      cliente: of.cliente,
      equipo: of.equipo,
      estado: {
        valor: of.estado,
        label: ESTADO_OF_LABELS[of.estado],
        colorClass: ESTADO_OF_COLORS[of.estado],
        dotColorClass: ESTADO_OF_DOT_COLORS[of.estado],
      },
      prioridad: {
        valor: of.prioridad,
        label: PRIORIDAD_OF_LABELS[of.prioridad],
      },
      critica: of.critica,
      hhEstimadas: of.hhEstimadas,
      hhConsumidas: Math.round(of.hhConsumidas * 10) / 10,
      porcentajeHH,
      slaVencimiento: of.slaVencimiento ? of.slaVencimiento.toISOString() : null,
      slaStatus: status,
      slaDelta: delta,
      tecnicos: of.asignaciones.map((a) => ({
        id: a.usuario.id,
        iniciales: a.usuario.iniciales,
        color: a.usuario.color,
        nombre: `${a.usuario.nombre} ${a.usuario.apellido}`.trim(),
      })),
    };
  });

  items.sort((a, b) => {
    const ds = SLA_ORDER[a.slaStatus] - SLA_ORDER[b.slaStatus];
    if (ds !== 0) return ds;
    const dp =
      PRIORIDAD_OF_ORDER.indexOf(a.prioridad.valor) - PRIORIDAD_OF_ORDER.indexOf(b.prioridad.valor);
    if (dp !== 0) return dp;
    return a.numero.localeCompare(b.numero);
  });

  return Response.json({
    ordenes: items.slice(0, limite),
    total: items.length,
  });
}
