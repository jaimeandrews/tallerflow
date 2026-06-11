import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { resolverSucursalId } from "@/lib/services/dashboard-service";
import type { NivelAlerta } from "@/types/centro-control";

const querySchema = z.object({
  sucursalId: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(50).default(20),
});

const NIVEL_ORDER: Record<NivelAlerta, number> = {
  critico: 0,
  warning: 1,
  info: 2,
};

function normalizarNivel(raw: string): NivelAlerta {
  const n = raw.toLowerCase();
  if (n === "critico" || n === "critical" || n === "critica") return "critico";
  if (n === "warning" || n === "advertencia") return "warning";
  return "info";
}

function parseDatos(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

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

  const sucursalId = resolverSucursalId(user.rol, user.sucursalId, parsed.data.sucursalId);
  const { limite } = parsed.data;

  const alertas = await prisma.alerta.findMany({
    where: { sucursalId, resuelta: false },
    orderBy: { createdAt: "desc" },
    take: limite * 3, // sobre-fetch para luego ordenar por nivel
    select: {
      id: true,
      titulo: true,
      descripcion: true,
      nivel: true,
      configuracionSlaId: true,
      datos: true,
      createdAt: true,
    },
  });

  const items = alertas
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      descripcion: a.descripcion,
      nivel: normalizarNivel(a.nivel),
      configuracionSlaId: a.configuracionSlaId,
      datos: parseDatos(a.datos),
      createdAt: a.createdAt.toISOString(),
    }))
    .sort((x, y) => {
      const dn = NIVEL_ORDER[x.nivel] - NIVEL_ORDER[y.nivel];
      if (dn !== 0) return dn;
      return y.createdAt.localeCompare(x.createdAt); // más reciente primero
    })
    .slice(0, limite);

  return Response.json({ alertas: items, total: items.length });
}
