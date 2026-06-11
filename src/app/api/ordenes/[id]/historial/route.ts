import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the OF belongs to the user's branch (row-level security)
  const of = await prisma.ordenTrabajo.findFirst({
    where: aplicaFiltroSucursal(user.rol)
      ? { id, sucursalId: user.sucursalId, eliminada: false }
      : { id, eliminada: false },
    select: { id: true },
  });

  if (!of) {
    return Response.json({ error: "OF no encontrada" }, { status: 404 });
  }

  const historial = await prisma.logAuditoria.findMany({
    where: { entidad: "OrdenTrabajo", entidadId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      accion: true,
      datosAnteriores: true,
      datosNuevos: true,
      createdAt: true,
      ip: true,
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
  });

  return Response.json({ historial });
}
