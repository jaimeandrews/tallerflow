import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import {
  calcularCarga,
  estadoDesdeUltimoMarcaje,
  HH_CAPACIDAD_DIARIA,
  sucursalWhereFromUser,
  type TecnicoConCarga,
} from "@/lib/services/asignacion-service";

const FILTROS_VALIDOS = ["todos", "disponibles", "ocupados"] as const;
type Filtro = (typeof FILTROS_VALIDOS)[number];

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const filtroRaw = sp.get("filtro") ?? "todos";
  const filtro: Filtro = (FILTROS_VALIDOS as readonly string[]).includes(filtroRaw)
    ? (filtroRaw as Filtro)
    : "todos";
  const sucursalId = sucursalWhereFromUser(
    user.rol,
    user.sucursalId,
    sp.get("sucursalId") ?? undefined
  );

  const tecnicos = await prisma.usuario.findMany({
    where: { rol: "TECNICO", activo: true, sucursalId },
    orderBy: [{ nombre: "asc" }, { apellido: "asc" }],
    select: {
      id: true,
      nombre: true,
      apellido: true,
      iniciales: true,
      color: true,
      rol: true,
      especialidades: {
        select: {
          especialidad: { select: { nombre: true } },
        },
      },
      asignaciones: {
        where: { activa: true },
        select: {
          hhPlanificadas: true,
          ordenTrabajo: {
            select: {
              id: true,
              numero: true,
              nombre: true,
              estado: true,
              prioridad: true,
              eliminada: true,
            },
          },
        },
      },
      marcajes: {
        orderBy: { horaInicio: "desc" },
        take: 1,
        select: {
          horaFin: true,
          tipo: true,
          actividad: { select: { nombre: true, productiva: true } },
        },
      },
    },
  });

  const resultado: TecnicoConCarga[] = tecnicos.map((t) => {
    const asignacionesActivas = t.asignaciones.filter(
      (a) => !a.ordenTrabajo.eliminada && a.ordenTrabajo.estado !== "FINALIZADA"
    );

    const hhAsignadas = asignacionesActivas.reduce((acc, a) => acc + a.hhPlanificadas, 0);

    const ultimoMarcaje = t.marcajes[0] ?? null;
    const estadoActual = estadoDesdeUltimoMarcaje(
      ultimoMarcaje
        ? {
            horaFin: ultimoMarcaje.horaFin,
            tipo: ultimoMarcaje.tipo,
            actividad: ultimoMarcaje.actividad,
          }
        : null
    );

    return {
      id: t.id,
      nombre: t.nombre,
      apellido: t.apellido,
      iniciales: t.iniciales,
      color: t.color,
      rol: t.rol,
      especialidades: t.especialidades.map((e) => e.especialidad.nombre),
      estadoActual,
      carga: calcularCarga(hhAsignadas),
      ofAsignadas: asignacionesActivas.map((a) => ({
        ofId: a.ordenTrabajo.id,
        ofNumero: a.ordenTrabajo.numero,
        ofNombre: a.ordenTrabajo.nombre,
        ofEstado: a.ordenTrabajo.estado,
        ofPrioridad: a.ordenTrabajo.prioridad,
        hhPlanificadas: a.hhPlanificadas,
      })),
    };
  });

  // Apply filtro
  const filtrado =
    filtro === "disponibles"
      ? resultado.filter((t) => t.carga.hhAsignadas < HH_CAPACIDAD_DIARIA)
      : filtro === "ocupados"
        ? resultado.filter((t) => t.carga.hhAsignadas > 0)
        : resultado;

  return Response.json({ tecnicos: filtrado });
}
