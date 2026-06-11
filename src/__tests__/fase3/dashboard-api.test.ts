import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: { count: vi.fn(), findMany: vi.fn() },
    marcaje: { findMany: vi.fn(), count: vi.fn() },
    ordenTrabajo: { count: vi.fn(), findMany: vi.fn() },
    actividad: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  getAuthUser: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { GET as kpisGET } from "@/app/api/dashboard/kpis/route";
import { GET as productividadChartGET } from "@/app/api/dashboard/productividad-chart/route";
import { GET as ofCriticasGET } from "@/app/api/dashboard/of-criticas/route";
import { GET as tecnicosEnTallerGET } from "@/app/api/dashboard/tecnicos-en-taller/route";
import { GET as timelineGET } from "@/app/api/dashboard/timeline/route";

import { NextRequest } from "next/server";

function makeReq(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  (getAuthUser as any).mockResolvedValue({
    id: "user-1",
    rol: "ADMIN",
    sucursalId: "550e8400-e29b-41d4-a716-446655440000",
  });
});

describe("dashboard-api", () => {
  describe("KPIs (/api/dashboard/kpis)", () => {
    it("retorna valores correctos con datos del seed", async () => {
      (prisma.usuario.count as any).mockResolvedValue(10);
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          usuarioId: "tec-1",
          ordenTrabajoId: "of-1",
          horaInicio: new Date(),
          horaFin: null,
          actividad: { productiva: true },
        },
      ]);
      (prisma.ordenTrabajo.count as any).mockResolvedValue(5); // ofEnProceso
      (prisma.ordenTrabajo.count as any).mockResolvedValueOnce(5).mockResolvedValueOnce(2); // ofCriticas
      (prisma.actividad.findFirst as any).mockResolvedValue({ id: "act-1" });

      const res = await kpisGET(
        makeReq("/api/dashboard/kpis?sucursalId=550e8400-e29b-41d4-a716-446655440000") as any
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tecnicosTotal).toBe(10);
      expect(json.tecnicosActivos).toBe(1);
      expect(json.ofEnProceso).toBe(5);
      expect(json.ofCriticas).toBe(2);
    });

    it("filtro por sucursalId solo retorna datos de esa sucursal", async () => {
      (prisma.usuario.count as any).mockResolvedValue(0);
      (prisma.marcaje.findMany as any).mockResolvedValue([]);
      (prisma.ordenTrabajo.count as any).mockResolvedValue(0);

      const res = await kpisGET(
        makeReq("/api/dashboard/kpis?sucursalId=550e8400-e29b-41d4-a716-446655440001") as any
      );
      expect(res.status).toBe(200);
      expect(prisma.usuario.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sucursalId: "550e8400-e29b-41d4-a716-446655440001" }),
        })
      );
    });

    it("deltaTecnicosAyer calcula correctamente la diferencia", async () => {
      (prisma.usuario.count as any).mockResolvedValue(10);

      // marcajesHoy
      (prisma.marcaje.findMany as any).mockResolvedValueOnce([
        {
          usuarioId: "tec-1",
          horaInicio: new Date(),
          horaFin: null,
          actividad: { productiva: true },
        },
        {
          usuarioId: "tec-2",
          horaInicio: new Date(),
          horaFin: null,
          actividad: { productiva: true },
        },
      ]);
      // marcajesAyer
      (prisma.marcaje.findMany as any).mockResolvedValueOnce([{ usuarioId: "tec-1" }]);
      (prisma.ordenTrabajo.count as any).mockResolvedValue(0);

      const res = await kpisGET(makeReq("/api/dashboard/kpis") as any);
      const json = await res.json();
      expect(json.tecnicosActivos).toBe(2);
      expect(json.deltaTecnicosAyer).toBe(1); // 2 activos hoy - 1 activo ayer
    });
  });

  describe("Productividad chart (/api/dashboard/productividad-chart)", () => {
    it("periodo 'hoy': retorna puntos por hora", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          horaInicio: new Date(),
          horaFin: new Date(Date.now() + 3600000),
          duracionMinutos: 60,
          actividad: { productiva: true },
        },
      ]);

      const res = await productividadChartGET(
        makeReq("/api/dashboard/productividad-chart?periodo=hoy") as any
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.pico).toBeDefined();
    });

    it("periodo '7d': retorna 7 puntos", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([]);

      const res = await productividadChartGET(
        makeReq("/api/dashboard/productividad-chart?periodo=7d") as any
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBe(7);
    });

    it("el pico es el valor más alto", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([]);

      const res = await productividadChartGET(
        makeReq("/api/dashboard/productividad-chart?periodo=7d") as any
      );
      const json = await res.json();

      if (json.data.length > 0) {
        const maxValor = Math.max(
          ...json.data.map((p: any) => (p.productividad !== undefined ? p.productividad : p.valor))
        );
        expect(json.pico.valor).toBe(maxValor);
      }
    });
  });

  describe("Tecnicos en taller (/api/dashboard/tecnicos-en-taller)", () => {
    it("retorna ordenados por estado (trabajando primero)", async () => {
      (prisma.usuario.findMany as any).mockResolvedValue([
        { id: "t1", nombre: "A", estado: "DISPONIBLE", marcajes: [] },
        {
          id: "t2",
          nombre: "B",
          estado: "TRABAJANDO",
          marcajes: [{ horaInicio: new Date(), horaFin: null, actividad: { productiva: true } }],
        },
      ]);

      const res = await tecnicosEnTallerGET(makeReq("/api/dashboard/tecnicos-en-taller") as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.tecnicos[0].estado).toBe("TRABAJANDO");
      expect(json.tecnicos[1].estado).toBe("DISPONIBLE");
    });

    it("duracionSegundos se calcula correctamente", async () => {
      const horaInicio = new Date(Date.now() - 120_000); // 2 minutes ago
      (prisma.usuario.findMany as any).mockResolvedValue([
        {
          id: "t1",
          estado: "TRABAJANDO",
          marcajes: [{ horaInicio, horaFin: null, actividad: { productiva: true } }],
        },
      ]);

      const res = await tecnicosEnTallerGET(makeReq("/api/dashboard/tecnicos-en-taller") as any);
      const json = await res.json();
      expect(json.tecnicos[0].duracionSegundos).toBeGreaterThanOrEqual(119);
    });
  });

  describe("OF críticas (/api/dashboard/of-criticas)", () => {
    it("solo retorna OF con critica=true o estado PAUSADA/ESPERA_REPUESTO", async () => {
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([
        {
          id: "of1",
          numero: "OF-1",
          prioridad: { valor: 1 },
          critica: true,
          estado: "EN_PROCESO",
          asignaciones: [],
        },
        {
          id: "of2",
          numero: "OF-2",
          prioridad: { valor: 2 },
          critica: false,
          estado: "ESPERA_REPUESTO",
          asignaciones: [],
        },
      ]);

      const res = await ofCriticasGET(makeReq("/api/dashboard/of-criticas") as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ordenes.length).toBe(2);
    });

    it("slaStatus 'vencida' cuando slaVencimiento < now", async () => {
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([
        {
          id: "of1",
          numero: "OF-1",
          prioridad: { valor: 1 },
          critica: true,
          slaVencimiento: new Date(Date.now() - 3600000),
          asignaciones: [],
        }, // 1 hour ago
      ]);

      const res = await ofCriticasGET(makeReq("/api/dashboard/of-criticas") as any);
      const json = await res.json();
      expect(json.ordenes[0].slaStatus).toBe("vencida");
    });

    it("slaStatus 'warning' cuando slaVencimiento < now + 4h", async () => {
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([
        {
          id: "of1",
          numero: "OF-1",
          prioridad: { valor: 1 },
          critica: true,
          slaVencimiento: new Date(Date.now() + 2 * 3600000),
          asignaciones: [],
        }, // in 2 hours
      ]);

      const res = await ofCriticasGET(makeReq("/api/dashboard/of-criticas") as any);
      const json = await res.json();
      expect(json.ordenes[0].slaStatus).toBe("warning");
    });
  });

  describe("Timeline (/api/dashboard/timeline)", () => {
    it("retorna marcajes de TODOS los técnicos de la sucursal", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          id: "m1",
          tipo: "INICIO",
          horaInicio: new Date(),
          horaFin: null,
          usuario: { nombre: "A", apellido: "A" },
          actividad: { productiva: true },
        },
        {
          id: "m2",
          tipo: "PAUSA",
          horaInicio: new Date(),
          horaFin: null,
          usuario: { nombre: "B", apellido: "B" },
          actividad: { productiva: false },
        },
      ]);

      const res = await timelineGET(makeReq("/api/dashboard/timeline") as any);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.eventos.length).toBe(2);
    });

    it("el tono es correcto según tipo de marcaje", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          id: "m1",
          tipo: "INICIO",
          horaInicio: new Date(),
          horaFin: null,
          usuario: { nombre: "A", apellido: "A", iniciales: "AA", id: "u1" },
          actividad: { productiva: true },
        },
        {
          id: "m2",
          tipo: "FIN",
          horaInicio: new Date(),
          horaFin: null,
          usuario: { nombre: "A", apellido: "A", iniciales: "AA", id: "u1" },
          actividad: { productiva: true },
        },
        {
          id: "m3",
          tipo: "PAUSA",
          horaInicio: new Date(),
          horaFin: null,
          usuario: { nombre: "A", apellido: "A", iniciales: "AA", id: "u1" },
          actividad: { productiva: false },
        },
      ]);

      const res = await timelineGET(makeReq("/api/dashboard/timeline") as any);
      const json = await res.json();
      const eventos = json.eventos;
      const tInicio = eventos.find((e: any) => e.tipo === "inicio");
      const tFin = eventos.find((e: any) => e.tipo === "fin");
      const tPausa = eventos.find((e: any) => e.tipo === "pausa");

      expect(["blue", "gray", "yellow"]).toContain(tInicio.tono);
      expect(tPausa.tono).toBe("yellow");
    });
  });
});
