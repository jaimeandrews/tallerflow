import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    actividad: { findMany: vi.fn() },
    sucursal: { findMany: vi.fn() },
    usuario: { groupBy: vi.fn() },
    ordenTrabajo: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  getAuthUser: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { cache } from "@/lib/cache";
import { NextRequest } from "next/server";
import { GET as actividadesGET } from "@/app/api/actividades/route";

const SUCURSAL_A = "550e8400-e29b-41d4-a716-446655440000";
const SUCURSAL_B = "660e8400-e29b-41d4-a716-446655440111";

function makeReq(url: string) {
  return new NextRequest(`http://localhost${url}`, { method: "GET" });
}

/** Acceso tipado a un doble de prueba sin recurrir a `any`. */
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  cache.clear();
});

/**
 * Estas respuestas llevan `Cache-Control: private, max-age=300` y su contenido
 * depende del usuario autenticado (se filtra por sucursalId). Sin
 * `Vary: Authorization` el caché HTTP del navegador puede servirle a un usuario
 * la respuesta calculada para otro.
 */
describe("Cabeceras de caché en endpoints auth-dependientes", () => {
  it("GET /api/actividades declara Vary: Authorization", async () => {
    asMock(getAuthUser).mockResolvedValue({
      id: "u1",
      rol: "TECNICO",
      sucursalId: SUCURSAL_A,
    });
    asMock(prisma.actividad.findMany).mockResolvedValue([]);

    const res = await actividadesGET(makeReq("/api/actividades"));

    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("Vary")).toMatch(/authorization/i);
  });

  it("GET /api/configuracion/sucursales declara Vary: Authorization", async () => {
    asMock(getAuthUser).mockResolvedValue({
      id: "admin",
      rol: "ADMIN",
      sucursalId: SUCURSAL_A,
    });
    asMock(prisma.sucursal.findMany).mockResolvedValue([]);
    asMock(prisma.usuario.groupBy).mockResolvedValue([]);
    asMock(prisma.ordenTrabajo.groupBy).mockResolvedValue([]);

    const { GET: sucursalesGET } = await import("@/app/api/configuracion/sucursales/route");
    const res = await sucursalesGET(makeReq("/api/configuracion/sucursales"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("Vary")).toMatch(/authorization/i);
  });

  it("no mezcla actividades entre sucursales distintas", async () => {
    asMock(getAuthUser).mockResolvedValue({
      id: "u1",
      rol: "TECNICO",
      sucursalId: SUCURSAL_A,
    });
    asMock(prisma.actividad.findMany).mockResolvedValue([
      { id: "a", nombre: "Solo A", color: "#000", icono: null, productiva: true },
    ]);
    const resA = await actividadesGET(makeReq("/api/actividades"));
    expect((await resA.json()).actividades).toHaveLength(1);

    asMock(getAuthUser).mockResolvedValue({
      id: "u2",
      rol: "TECNICO",
      sucursalId: SUCURSAL_B,
    });
    asMock(prisma.actividad.findMany).mockResolvedValue([]);
    const resB = await actividadesGET(makeReq("/api/actividades"));

    // Clave de caché distinta por sucursal → no reutiliza la lista de A.
    expect((await resB.json()).actividades).toHaveLength(0);
  });
});

/**
 * CACHE_KEYS.turnos existía documentado pero sin ningún consumidor. Una clave
 * declarada y nunca usada invita a asumir que los turnos están cacheados
 * cuando no lo están.
 */
describe("CACHE_KEYS", () => {
  it("no expone claves sin uso", async () => {
    const { CACHE_KEYS } = await import("@/lib/cache");
    expect(CACHE_KEYS).not.toHaveProperty("turnos");
  });
});
