import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { aplicaFiltroSucursal, puedeGestionarOF } from "@/lib/services/ordenes-service";
import { actualizarOFSchema } from "@/lib/utils/validators";

const OF_DETAIL_SELECT = {
  id: true,
  numero: true,
  proyecto: true,
  nombre: true,
  cliente: true,
  equipo: true,
  estado: true,
  prioridad: true,
  sucursalId: true,
  hhEstimadas: true,
  hhConsumidas: true,
  slaVencimiento: true,
  critica: true,
  tecnicosRequeridos: true,
  createdAt: true,
  updatedAt: true,
  sucursal: { select: { id: true, nombre: true, codigo: true } },
  asignaciones: {
    where: { activa: true },
    select: {
      id: true,
      hhPlanificadas: true,
      fechaAsignacion: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          iniciales: true,
          color: true,
          rol: true,
        },
      },
    },
  },
  marcajes: {
    take: 10,
    orderBy: { horaInicio: "desc" as const },
    select: {
      id: true,
      tipo: true,
      horaInicio: true,
      horaFin: true,
      duracionMinutos: true,
      notas: true,
      usuario: {
        select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
      },
      actividad: {
        select: { id: true, nombre: true, color: true, icono: true, productiva: true },
      },
    },
  },
} as const;

async function fetchOF(id: string, sucursalId: string | null) {
  const where = sucursalId ? { id, sucursalId, eliminada: false } : { id, eliminada: false };
  return prisma.ordenTrabajo.findFirst({
    where,
    select: OF_DETAIL_SELECT,
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  const ordenTrabajo = await fetchOF(id, aplicaFiltroSucursal(user.rol) ? user.sucursalId : null);

  if (!ordenTrabajo) {
    return Response.json({ error: "OF no encontrada" }, { status: 404 });
  }

  const marcajeFilter = {
    ordenTrabajoId: id,
    horaFin: { not: null as null },
    duracionMinutos: { not: null as null },
  };

  const [configuracionSla, hhAgregado, hhProductivasAgg, hhNoProductivasAgg] = await Promise.all([
    prisma.configuracionSLA.findMany({
      where: { sucursalId: ordenTrabajo.sucursalId, activa: true },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        condicion: true,
        umbralMinutos: true,
        nivelAlerta: true,
      },
    }),
    prisma.marcaje.groupBy({
      by: ["usuarioId"],
      where: marcajeFilter,
      _sum: { duracionMinutos: true },
    }),
    prisma.marcaje.aggregate({
      where: { ...marcajeFilter, actividad: { productiva: true } },
      _sum: { duracionMinutos: true },
    }),
    prisma.marcaje.aggregate({
      where: { ...marcajeFilter, actividad: { productiva: false } },
      _sum: { duracionMinutos: true },
    }),
  ]);

  const hhPorTecnico: Record<string, number> = {};
  for (const row of hhAgregado) {
    hhPorTecnico[row.usuarioId] = (row._sum.duracionMinutos ?? 0) / 60;
  }

  return Response.json({
    ordenTrabajo,
    configuracionSla,
    hhPorTecnico,
    hhProductivas: (hhProductivasAgg._sum.duracionMinutos ?? 0) / 60,
    hhNoProductivas: (hhNoProductivasAgg._sum.duracionMinutos ?? 0) / 60,
  });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!puedeGestionarOF(user.rol)) {
    return Response.json({ error: "Sin permisos para editar OF" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = actualizarOFSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const existente = await prisma.ordenTrabajo.findFirst({
    where: { id, eliminada: false },
  });
  if (!existente) {
    return Response.json({ error: "OF no encontrada" }, { status: 404 });
  }

  if (user.rol !== "ADMIN" && existente.sucursalId !== user.sucursalId) {
    return Response.json({ error: "OF de otra sucursal" }, { status: 403 });
  }

  const data = parsed.data;

  // Unique numero check if changing
  if (data.numero && data.numero !== existente.numero) {
    const dup = await prisma.ordenTrabajo.findUnique({
      where: { numero: data.numero },
      select: { id: true },
    });
    if (dup) {
      return Response.json({ error: "Ya existe otra OF con ese número" }, { status: 409 });
    }
  }

  // Block FINALIZADA with active marcajes
  if (data.estado === "FINALIZADA" && existente.estado !== "FINALIZADA") {
    const marcajeAbierto = await prisma.marcaje.findFirst({
      where: { ordenTrabajoId: id, horaFin: null },
      select: { id: true },
    });
    if (marcajeAbierto) {
      return Response.json(
        { error: "No se puede finalizar: hay marcajes activos en la OF" },
        { status: 409 }
      );
    }
  }

  // FINALIZADA cannot go back (except ADMIN)
  if (
    existente.estado === "FINALIZADA" &&
    data.estado &&
    data.estado !== "FINALIZADA" &&
    user.rol !== "ADMIN"
  ) {
    return Response.json({ error: "Solo ADMIN puede reabrir una OF finalizada" }, { status: 403 });
  }

  const ordenTrabajo = await prisma.ordenTrabajo.update({
    where: { id },
    data: {
      ...(data.numero !== undefined && { numero: data.numero }),
      ...(data.proyecto !== undefined && { proyecto: data.proyecto }),
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.cliente !== undefined && { cliente: data.cliente }),
      ...(data.equipo !== undefined && { equipo: data.equipo }),
      ...(data.hhEstimadas !== undefined && { hhEstimadas: data.hhEstimadas }),
      ...(data.prioridad !== undefined && { prioridad: data.prioridad }),
      ...(data.estado !== undefined && { estado: data.estado }),
      ...(data.tecnicosRequeridos !== undefined && {
        tecnicosRequeridos: data.tecnicosRequeridos,
      }),
      ...(data.slaVencimiento !== undefined && {
        slaVencimiento: data.slaVencimiento ? new Date(data.slaVencimiento) : null,
      }),
      ...(data.critica !== undefined && { critica: data.critica }),
    },
    select: OF_DETAIL_SELECT,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ACTUALIZAR_OF",
    entidad: "OrdenTrabajo",
    entidadId: id,
    datosAnteriores: existente,
    datosNuevos: data,
    ip: getClientIp(request),
  });

  return Response.json({ ordenTrabajo });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (user.rol !== "ADMIN") {
    return Response.json({ error: "Solo ADMIN puede eliminar OF" }, { status: 403 });
  }

  const { id } = await params;

  const existente = await prisma.ordenTrabajo.findFirst({
    where: { id, eliminada: false },
    select: { id: true, numero: true, _count: { select: { marcajes: true } } },
  });

  if (!existente) {
    return Response.json({ error: "OF no encontrada" }, { status: 404 });
  }

  if (existente._count.marcajes > 0) {
    return Response.json(
      { error: "No se puede eliminar: la OF tiene marcajes asociados" },
      { status: 409 }
    );
  }

  await prisma.ordenTrabajo.update({
    where: { id },
    data: { eliminada: true },
  });

  // Deactivate assignments
  await prisma.asignacionTecnico.updateMany({
    where: { ordenTrabajoId: id, activa: true },
    data: { activa: false },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "ELIMINAR_OF",
    entidad: "OrdenTrabajo",
    entidadId: id,
    datosAnteriores: existente,
    ip: getClientIp(request),
  });

  return Response.json({ ok: true });
}
