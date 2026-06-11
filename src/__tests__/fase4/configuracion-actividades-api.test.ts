import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    actividad: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    marcaje: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  getAuthUser: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/services/auditoria-service", () => ({
  registrarAuditoria: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { POST as crearActividadPOST } from "@/app/api/configuracion/actividades/route";
import { PUT as editarActividadPUT } from "@/app/api/configuracion/actividades/[id]/route";
import { PATCH as toggleActivaPATCH } from "@/app/api/configuracion/actividades/[id]/toggle-activa/route";

import { NextRequest } from "next/server";

function makeReq(url: string, body?: any, method = "POST") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const VALID_SUCURSAL_ID = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.actividad.create as any).mockReset();
  (prisma.actividad.findFirst as any).mockReset();
  (prisma.actividad.findUnique as any).mockReset();
  (prisma.actividad.update as any).mockReset();
  (prisma.marcaje.count as any).mockReset();
  (getAuthUser as any).mockReset();

  (getAuthUser as any).mockResolvedValue({
    id: "admin-id",
    rol: "ADMIN",
    sucursalId: VALID_SUCURSAL_ID,
  });
});

describe("Configuración - Actividades API", () => {
  describe("Crear Actividad (POST /api/configuracion/actividades)", () => {
    const validBody = {
      nombre: "Nueva Actividad",
      color: "#006FA0",
      productiva: true,
      sucursalId: VALID_SUCURSAL_ID,
    };

    it("Crear actividad productiva → productiva=true en BD", async () => {
      (prisma.actividad.findFirst as any).mockResolvedValue(null);
      (prisma.actividad.create as any).mockImplementation(({ data }: any) => ({
        id: "act-1",
        ...data,
      }));

      const req = makeReq("/api/configuracion/actividades", validBody);
      const res = await crearActividadPOST(req);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.actividad.productiva).toBe(true);

      expect(prisma.actividad.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            productiva: true,
          }),
        })
      );
    });

    it("Crear actividad con nombre duplicado en misma sucursal → 409", async () => {
      (prisma.actividad.findFirst as any).mockResolvedValue({ id: "existing-act" });

      const req = makeReq("/api/configuracion/actividades", validBody);
      const res = await crearActividadPOST(req);

      expect(res.status).toBe(409); // API returns 409 for duplicates
    });
  });

  describe("Desactivar Actividad (PATCH /api/configuracion/actividades/[id]/toggle-activa)", () => {
    it("Desactivar actividad con marcajes activos → error 409", async () => {
      (prisma.actividad.findUnique as any).mockResolvedValue({
        id: "act-1",
        nombre: "Actividad 1",
        sucursalId: VALID_SUCURSAL_ID,
        activa: true,
      });
      (prisma.marcaje.count as any).mockResolvedValue(3); // 3 marcajes activos

      const req = makeReq("/api/configuracion/actividades/act-1/toggle-activa", null, "PATCH");
      const res = await toggleActivaPATCH(req, { params: Promise.resolve({ id: "act-1" }) });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain("No se puede desactivar: hay 3 marcajes activos");
    });

    it("Desactivar actividad sin marcajes activos → OK", async () => {
      (prisma.actividad.findUnique as any).mockResolvedValue({
        id: "act-1",
        nombre: "Actividad 1",
        sucursalId: VALID_SUCURSAL_ID,
        activa: true,
      });
      (prisma.marcaje.count as any).mockResolvedValue(0); // 0 marcajes activos

      const req = makeReq("/api/configuracion/actividades/act-1/toggle-activa", null, "PATCH");
      const res = await toggleActivaPATCH(req, { params: Promise.resolve({ id: "act-1" }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.activa).toBe(false);

      expect(prisma.actividad.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "act-1" },
          data: { activa: false },
        })
      );
    });
  });

  describe("Editar Actividad (PUT /api/configuracion/actividades/[id])", () => {
    it("Cambiar productiva retorna warning con count de marcajes afectados", async () => {
      (prisma.actividad.findUnique as any).mockResolvedValue({
        id: "act-1",
        nombre: "Actividad 1",
        sucursalId: VALID_SUCURSAL_ID,
        productiva: true,
        color: "blue",
        activa: true,
      });
      (prisma.marcaje.count as any).mockResolvedValue(5); // 5 marcajes affected
      (prisma.actividad.update as any).mockImplementation(({ data }: any) => ({
        id: "act-1",
        ...data,
      }));

      const body = { productiva: false };
      const req = makeReq("/api/configuracion/actividades/act-1", body, "PUT");
      const res = await editarActividadPUT(req, { params: Promise.resolve({ id: "act-1" }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.warnings).toHaveLength(1);
      expect(json.warnings[0]).toContain(
        "afectará el cálculo de productividad histórica de 5 marcajes"
      );
    });
  });
});
