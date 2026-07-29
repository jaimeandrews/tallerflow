import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { cache, CACHE_KEYS } from "@/lib/cache";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const cacheKey = CACHE_KEYS.actividades(user.sucursalId);

  const actividades = await cache.getOrSet(cacheKey, () =>
    prisma.actividad.findMany({
      where: {
        activa: true,
        OR: [{ sucursalId: null }, { sucursalId: user.sucursalId }],
      },
      select: {
        id: true,
        nombre: true,
        color: true,
        icono: true,
        productiva: true,
      },
      orderBy: { nombre: "asc" },
    })
  );

  // private: auth-gated and filtered per sucursalId (not CDN-safe)
  // max-age=300: matches the in-process cache TTL (src/lib/cache.ts)
  // Vary: la lista depende del sucursalId del usuario autenticado; sin esto el
  // caché del navegador puede servirle a un usuario la respuesta de otro.
  return Response.json(
    { actividades },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
        Vary: "Authorization",
      },
    }
  );
}
