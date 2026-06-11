import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    configuracionSLA: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    sucursal: {
      findUnique: vi.fn(),
    },
    alerta: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    marcaje: {
      findMany: vi.fn(),
    },
    ordenTrabajo: {
      findMany: vi.fn(),
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

vi.mock("@/lib/socket/socket-emitter", () => ({
  socketEmit: {
    alertaNueva: vi.fn(),
    alertaResuelta: vi.fn(),
  },
}));

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { POST as crearReglaPOST } from "@/app/api/configuracion/sla/route";
import { PATCH as toggleActivaPATCH } from "@/app/api/configuracion/sla/[id]/toggle-activa/route";
import { evaluarAlertas } from "@/lib/services/alerta-service";

import { NextRequest } from "next/server";

function makeReq(url: string, body?: any, method = "POST") {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (getAuthUser as any).mockResolvedValue({
    id: "admin-id",
    rol: "ADMIN",
    sucursalId: "suc-1",
  });
});

describe("Configuración - SLA API", () => {
  describe("Crear Regla SLA (POST /api/configuracion/sla)", () => {
    const validSlaBody = {
      sucursalId: "550e8400-e29b-41d4-a716-446655440000",
      nombre: "Técnico inactivo",
      descripcion: "Alerta cuando el técnico no registra actividad",
      condicion: {
        tipo: "tecnico_detenido",
        umbralMinutos: 15,
      },
      umbralMinutos: 15,
      nivelAlerta: "warning",
    };

    it("Crear regla con tipo válido → OK", async () => {
      (prisma.sucursal.findUnique as any).mockResolvedValue({ id: "suc-1" });
      (prisma.configuracionSLA.create as any).mockResolvedValue({
        id: "sla-1",
        ...validSlaBody,
        condicion: "tecnico_detenido",
      });

      const req = makeReq("/api/configuracion/sla", validSlaBody);
      const res = await crearReglaPOST(req);

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.regla.id).toBe("sla-1");
    });

    it("Crear regla con tipo inventado → 400", async () => {
      const body = {
        ...validSlaBody,
        condicion: {
          tipo: "tipo_inventado",
          umbralMinutos: 15,
        },
      };

      const req = makeReq("/api/configuracion/sla", body);
      const res = await crearReglaPOST(req);

      expect(res.status).toBe(400);
    });

    it("Crear regla con umbral 0 → 400", async () => {
      const body = {
        ...validSlaBody,
        umbralMinutos: 0,
        condicion: {
          tipo: "tecnico_detenido",
          umbralMinutos: 0,
        },
      };

      const req = makeReq("/api/configuracion/sla", body);
      const res = await crearReglaPOST(req);

      expect(res.status).toBe(400);
    });

    it("Crear regla con umbral negativo → 400", async () => {
      const body = {
        ...validSlaBody,
        umbralMinutos: -10,
        condicion: {
          tipo: "tecnico_detenido",
          umbralMinutos: -10,
        },
      };

      const req = makeReq("/api/configuracion/sla", body);
      const res = await crearReglaPOST(req);

      expect(res.status).toBe(400);
    });
  });

  describe("Toggle Activa (PATCH /api/configuracion/sla/[id]/toggle-activa)", () => {
    it("Toggle activa: activar/desactivar funciona", async () => {
      (prisma.configuracionSLA.findUnique as any).mockResolvedValue({
        id: "sla-1",
        sucursalId: "suc-1",
        nombre: "Regla 1",
        activa: true,
      });

      const req = makeReq("/api/configuracion/sla/sla-1/toggle-activa", null, "PATCH");
      const res = await toggleActivaPATCH(req, { params: Promise.resolve({ id: "sla-1" }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.activa).toBe(false);

      expect(prisma.configuracionSLA.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sla-1" },
          data: { activa: false },
        })
      );
    });
  });

  describe("Integración Alertas (alerta-service)", () => {
    it("Regla desactivada no genera alertas (integración con alerta-service)", async () => {
      // evaluarAlertas buscará reglas activas.
      // Si Mockeamos prisma.configuracionSLA.findMany para que devuelva un array vacío
      // (ya que no hay reglas activas), no se evaluará ninguna condición.
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([]);

      const generatedAlerts = await evaluarAlertas("suc-1");

      expect(generatedAlerts).toHaveLength(0);
      expect(prisma.configuracionSLA.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sucursalId: "suc-1",
            activa: true,
          }),
        })
      );
    });
  });
});
