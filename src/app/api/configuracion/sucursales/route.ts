import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (user.rol !== "ADMIN") {
    return Response.json({ error: "Solo ADMIN puede gestionar sucursales" }, { status: 403 });
  }

  // Run all 3 queries in parallel — they are independent of each other
  const [sucursales, tecnicosPorSucursal, ofActivasPorSucursal] = await Promise.all([
    prisma.sucursal.findMany({
      orderBy: { nombre: "asc" },
      select: {
        id: true,
        nombre: true,
        codigo: true,
        activa: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            usuarios: true,
            ordenesTrabajo: { where: { eliminada: false } },
          },
        },
      },
    }),
    // Técnicos activos por sucursal
    prisma.usuario.groupBy({
      by: ["sucursalId"],
      where: { rol: "TECNICO", activo: true },
      _count: { _all: true },
    }),
    // OFs activas (no finalizadas) por sucursal
    prisma.ordenTrabajo.groupBy({
      by: ["sucursalId"],
      where: { eliminada: false, estado: { not: "FINALIZADA" } },
      _count: { _all: true },
    }),
  ]);

  const tecMap = new Map<string, number>(
    tecnicosPorSucursal.map((r) => [r.sucursalId, r._count._all])
  );
  const ofActivasMap = new Map<string, number>(
    ofActivasPorSucursal.map((r) => [r.sucursalId, r._count._all])
  );

  const data = sucursales.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    codigo: s.codigo,
    activa: s.activa,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    totalUsuarios: s._count.usuarios,
    totalOF: s._count.ordenesTrabajo,
    totalOFActivas: ofActivasMap.get(s.id) ?? 0,
    totalTecnicos: tecMap.get(s.id) ?? 0,
  }));

  // private: ADMIN-only endpoint with live counts; not safe for CDN
  // max-age=300: counts (usuarios, OF) can tolerate 5-min staleness in the config UI
  return Response.json(
    { data },
    {
      headers: { "Cache-Control": "private, max-age=300" },
    }
  );
}
