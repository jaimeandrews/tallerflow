import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { aplicaFiltroSucursal } from "@/lib/services/ordenes-service";
import type { Prisma } from "@/generated/prisma";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const sucursalIdParam = request.nextUrl.searchParams.get("sucursalId");

  const where: Prisma.UsuarioWhereInput = {
    activo: true,
    rol: "TECNICO",
  };

  if (aplicaFiltroSucursal(user.rol)) {
    where.sucursalId = user.sucursalId;
  } else if (sucursalIdParam) {
    where.sucursalId = sucursalIdParam;
  }

  const tecnicos = await prisma.usuario.findMany({
    where,
    select: {
      id: true,
      nombre: true,
      apellido: true,
      iniciales: true,
      color: true,
      sucursalId: true,
    },
    orderBy: [{ nombre: "asc" }, { apellido: "asc" }],
  });

  return Response.json({ tecnicos });
}
