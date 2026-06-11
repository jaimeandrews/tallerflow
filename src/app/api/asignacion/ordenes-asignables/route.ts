import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  detectarConflictos,
  sucursalWhereFromUser,
  type OFAsignable,
} from "@/lib/services/asignacion-service";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const sucursalId = sucursalWhereFromUser(
    user.rol,
    user.sucursalId,
    sp.get("sucursalId") ?? undefined
  );

  const rawOrdenes = await prisma.ordenTrabajo.findMany({
    where: {
      sucursalId,
      eliminada: false,
      estado: { not: "FINALIZADA" },
    },
    orderBy: [{ prioridad: "asc" }, { createdAt: "asc" }],
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
      tecnicosRequeridos: true,
      sucursalId: true,
      createdAt: true,
      sucursal: { select: { nombre: true } },
      asignaciones: {
        where: { activa: true },
        select: {
          id: true,
          hhPlanificadas: true,
          usuario: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              iniciales: true,
              color: true,
            },
          },
        },
      },
    },
  });

  // Build per-technician HH load map from the already-fetched rawOrdenes.
  // rawOrdenes already contains all active asignaciones with hhPlanificadas
  // and usuario.id for the same sucursal+estado filter — no second DB query needed.
  const hhPorTecnico: Record<string, number> = {};
  for (const of_ of rawOrdenes) {
    for (const a of of_.asignaciones) {
      hhPorTecnico[a.usuario.id] = (hhPorTecnico[a.usuario.id] ?? 0) + a.hhPlanificadas;
    }
  }

  const ordenes: OFAsignable[] = rawOrdenes.map((of) => {
    const asignadosCount = of.asignaciones.length;
    const hhTecnicos = of.asignaciones.map((a) => hhPorTecnico[a.usuario.id] ?? 0);

    const conflictos = detectarConflictos({
      of: {
        tecnicosRequeridos: of.tecnicosRequeridos,
        slaVencimiento: of.slaVencimiento,
        estado: of.estado,
      },
      asignadosCount,
      hhPorTecnico: hhTecnicos,
    });

    return {
      id: of.id,
      numero: of.numero,
      nombre: of.nombre,
      proyecto: of.proyecto,
      cliente: of.cliente,
      equipo: of.equipo,
      estado: of.estado,
      prioridad: of.prioridad,
      hhEstimadas: of.hhEstimadas,
      hhConsumidas: of.hhConsumidas,
      slaVencimiento: of.slaVencimiento?.toISOString() ?? null,
      critica: of.critica,
      tecnicosRequeridos: of.tecnicosRequeridos,
      sucursalId: of.sucursalId,
      sucursalNombre: of.sucursal.nombre,
      createdAt: of.createdAt.toISOString(),
      asignados: of.asignaciones.map((a) => ({
        asignacionId: a.id,
        hhPlanificadas: a.hhPlanificadas,
        usuario: {
          id: a.usuario.id,
          nombre: a.usuario.nombre,
          apellido: a.usuario.apellido,
          iniciales: a.usuario.iniciales,
          color: a.usuario.color,
        },
      })),
      slots: {
        requeridos: of.tecnicosRequeridos,
        asignados: asignadosCount,
        faltantes: Math.max(0, of.tecnicosRequeridos - asignadosCount),
      },
      conflictos,
    };
  });

  return Response.json({ ordenes });
}
