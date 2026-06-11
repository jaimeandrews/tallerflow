import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    actividad: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    configuracionSLA: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    logAuditoria: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  getAuthUser: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { GET as getUsuariosGET } from "@/app/api/configuracion/usuarios/route";
import { GET as getActividadesGET } from "@/app/api/configuracion/actividades/route";
import { GET as getSlaGET } from "@/app/api/configuracion/sla/route";
import { GET as getAuditoriaGET } from "@/app/api/configuracion/auditoria/route";

import { NextRequest } from "next/server";

function makeReq(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

const SUCURSAL_1 = "550e8400-e29b-41d4-a716-446655440000";
const SUCURSAL_2 = "550e8400-e29b-41d4-a716-446655440001";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.usuario.count as any).mockReset();
  (prisma.usuario.findMany as any).mockReset();
  (prisma.actividad.findMany as any).mockReset();
  (prisma.configuracionSLA.findMany as any).mockReset();
  (prisma.logAuditoria.count as any).mockReset();
  (prisma.logAuditoria.findMany as any).mockReset();
  (getAuthUser as any).mockReset();

  // Re-establish basic mock resolves
  (prisma.usuario.count as any).mockResolvedValue(0);
  (prisma.usuario.findMany as any).mockResolvedValue([]);
  (prisma.actividad.findMany as any).mockResolvedValue([]);
  (prisma.configuracionSLA.findMany as any).mockResolvedValue([]);
  (prisma.logAuditoria.count as any).mockResolvedValue(0);
  (prisma.logAuditoria.findMany as any).mockResolvedValue([]);
});

describe("Configuración - Permisos", () => {
  it("ADMIN accede a todas las secciones → OK", async () => {
    (getAuthUser as any).mockResolvedValue({
      id: "admin-id",
      rol: "ADMIN",
      sucursalId: SUCURSAL_1,
    });

    const endpoints = [
      getUsuariosGET(makeReq("/api/configuracion/usuarios")),
      getActividadesGET(makeReq("/api/configuracion/actividades")),
      getSlaGET(makeReq("/api/configuracion/sla")),
      getAuditoriaGET(makeReq("/api/configuracion/auditoria")),
    ];

    const responses = await Promise.all(endpoints);

    for (const res of responses) {
      expect(res.status).toBe(200);
    }
  });

  it("JEFE_TALLER accede a usuarios de su sucursal → OK", async () => {
    (getAuthUser as any).mockResolvedValue({
      id: "jefe-id",
      rol: "JEFE_TALLER",
      sucursalId: SUCURSAL_1,
    });

    const res = await getUsuariosGET(makeReq("/api/configuracion/usuarios"));
    expect(res.status).toBe(200);

    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sucursalId: SUCURSAL_1,
        }),
      })
    );
  });

  it("JEFE_TALLER intenta ver usuarios de otra sucursal → filtrado (usa la propia)", async () => {
    (getAuthUser as any).mockResolvedValue({
      id: "jefe-id",
      rol: "JEFE_TALLER",
      sucursalId: SUCURSAL_1,
    });

    const res = await getUsuariosGET(
      makeReq(`/api/configuracion/usuarios?sucursalId=${SUCURSAL_2}`)
    );
    expect(res.status).toBe(200);

    // El filtro de sucursal debe ser SUCURSAL_1 (la del jefe), ignorando el parámetro SUCURSAL_2
    expect(prisma.usuario.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sucursalId: SUCURSAL_1,
        }),
      })
    );
  });

  it("TECNICO accede a /configuracion → 403 o redirect", async () => {
    (getAuthUser as any).mockResolvedValue({
      id: "tecnico-id",
      rol: "TECNICO",
      sucursalId: SUCURSAL_1,
    });

    const endpoints = [
      getUsuariosGET(makeReq("/api/configuracion/usuarios")),
      getActividadesGET(makeReq("/api/configuracion/actividades")),
      getSlaGET(makeReq("/api/configuracion/sla")),
      getAuditoriaGET(makeReq("/api/configuracion/auditoria")),
    ];

    const responses = await Promise.all(endpoints);

    for (const res of responses) {
      expect(res.status).toBe(403);
    }
  });

  it("CONTROL_GESTION accede solo a auditoría → OK", async () => {
    (getAuthUser as any).mockResolvedValue({
      id: "control-id",
      rol: "CONTROL_GESTION",
      sucursalId: SUCURSAL_1,
    });

    // Acceso a auditoría -> OK
    const resAuditoria = await getAuditoriaGET(makeReq("/api/configuracion/auditoria"));
    expect(resAuditoria.status).toBe(200);

    // Acceso a otras secciones -> 403
    const resUsuarios = await getUsuariosGET(makeReq("/api/configuracion/usuarios"));
    expect(resUsuarios.status).toBe(403);

    const resActividades = await getActividadesGET(makeReq("/api/configuracion/actividades"));
    expect(resActividades.status).toBe(403);

    const resSla = await getSlaGET(makeReq("/api/configuracion/sla"));
    expect(resSla.status).toBe(403);
  });

  it("COORDINADOR accede a /configuracion → 403", async () => {
    (getAuthUser as any).mockResolvedValue({
      id: "coordinador-id",
      rol: "COORDINADOR",
      sucursalId: SUCURSAL_1,
    });

    const endpoints = [
      getUsuariosGET(makeReq("/api/configuracion/usuarios")),
      getActividadesGET(makeReq("/api/configuracion/actividades")),
      getSlaGET(makeReq("/api/configuracion/sla")),
      getAuditoriaGET(makeReq("/api/configuracion/auditoria")),
    ];

    const responses = await Promise.all(endpoints);

    for (const res of responses) {
      expect(res.status).toBe(403);
    }
  });
});
