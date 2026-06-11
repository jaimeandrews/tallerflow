import { type NextRequest } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { aplicaFiltroSucursal, puedeGestionarOF } from "@/lib/services/ordenes-service";
import { crearOFSchema, listarOFQuerySchema } from "@/lib/utils/validators";

const OF_LIST_SELECT = {
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
      usuario: {
        select: { id: true, nombre: true, apellido: true, iniciales: true, color: true },
      },
    },
  },
  _count: { select: { marcajes: true } },
} as const;

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = listarOFQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    estado,
    prioridad,
    sucursalId,
    tecnicoId,
    busqueda,
    pagina,
    porPagina,
    ordenarPor,
    direccion,
  } = parsed.data;

  const where: Prisma.OrdenTrabajoWhereInput = { eliminada: false };

  if (aplicaFiltroSucursal(user.rol)) {
    where.sucursalId = user.sucursalId;
  } else if (sucursalId) {
    where.sucursalId = sucursalId;
  }

  if (estado) where.estado = estado;
  if (prioridad) where.prioridad = prioridad;

  if (tecnicoId) {
    where.asignaciones = { some: { usuarioId: tecnicoId, activa: true } };
  }

  if (busqueda) {
    where.OR = [
      { numero: { contains: busqueda, mode: "insensitive" } },
      { nombre: { contains: busqueda, mode: "insensitive" } },
      { proyecto: { contains: busqueda, mode: "insensitive" } },
      { cliente: { contains: busqueda, mode: "insensitive" } },
      { equipo: { contains: busqueda, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.OrdenTrabajoOrderByWithRelationInput =
    ordenarPor === "prioridad"
      ? { prioridad: direccion }
      : ordenarPor === "estado"
        ? { estado: direccion }
        : ordenarPor === "hhConsumidas"
          ? { hhConsumidas: direccion }
          : ordenarPor === "slaVencimiento"
            ? { slaVencimiento: direccion }
            : ordenarPor === "createdAt"
              ? { createdAt: direccion }
              : { numero: direccion };

  const skip = (pagina - 1) * porPagina;

  const [total, data] = await Promise.all([
    prisma.ordenTrabajo.count({ where }),
    prisma.ordenTrabajo.findMany({
      where,
      orderBy,
      skip,
      take: porPagina,
      select: OF_LIST_SELECT,
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return Response.json({ data, total, pagina, totalPaginas, porPagina });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!puedeGestionarOF(user.rol)) {
    return Response.json({ error: "Sin permisos para crear OF" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = crearOFSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Non-admins can only create OF for their own sucursal
  if (user.rol !== "ADMIN" && data.sucursalId !== user.sucursalId) {
    return Response.json({ error: "No puede crear OF en otra sucursal" }, { status: 403 });
  }

  // Validate sucursal exists
  const sucursal = await prisma.sucursal.findUnique({
    where: { id: data.sucursalId },
    select: { id: true, activa: true },
  });
  if (!sucursal) {
    return Response.json({ error: "Sucursal no encontrada" }, { status: 404 });
  }
  if (!sucursal.activa) {
    return Response.json({ error: "Sucursal inactiva" }, { status: 400 });
  }

  // numero must be unique
  const existente = await prisma.ordenTrabajo.findUnique({
    where: { numero: data.numero },
    select: { id: true },
  });
  if (existente) {
    return Response.json({ error: "Ya existe una OF con ese número" }, { status: 409 });
  }

  const ordenTrabajo = await prisma.ordenTrabajo.create({
    data: {
      numero: data.numero,
      proyecto: data.proyecto,
      nombre: data.nombre,
      cliente: data.cliente,
      equipo: data.equipo,
      sucursalId: data.sucursalId,
      hhEstimadas: data.hhEstimadas,
      hhConsumidas: 0,
      prioridad: data.prioridad,
      estado: "PENDIENTE",
      tecnicosRequeridos: data.tecnicosRequeridos ?? 1,
      slaVencimiento: data.slaVencimiento ? new Date(data.slaVencimiento) : null,
      critica: data.critica ?? data.prioridad === "CRITICA",
    },
    select: OF_LIST_SELECT,
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "CREAR_OF",
    entidad: "OrdenTrabajo",
    entidadId: ordenTrabajo.id,
    datosNuevos: ordenTrabajo,
    ip: getClientIp(request),
  });

  return Response.json({ ordenTrabajo }, { status: 201 });
}
