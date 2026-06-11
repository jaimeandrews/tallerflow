import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: { count: vi.fn(), findMany: vi.fn() },
    marcaje: { findMany: vi.fn() },
    ordenTrabajo: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    alerta: { findMany: vi.fn(), groupBy: vi.fn() },
    actividad: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  getAuthUser: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { GET as estadoGeneralGET } from "@/app/api/centro-control/estado-general/route";
import { GET as ofTimelineSegmentosGET } from "@/app/api/centro-control/of-timeline-segmentos/route";
import { GET as mixActividadGET } from "@/app/api/centro-control/mix-actividad/route";
import { GET as alertasActivasGET } from "@/app/api/centro-control/alertas-activas/route";
import { GET as kpisGET } from "@/app/api/centro-control/kpis/route";

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
  (prisma.alerta.groupBy as any).mockResolvedValue([]);
});

describe("centro-control-api", () => {
  describe("Estado general (/api/centro-control/estado-general)", () => {
    it("retorna todas las secciones (tecnicos, ofActivas, alertas, mix, kpis)", async () => {
      (prisma.usuario.findMany as any).mockResolvedValue([]);
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([]);
      (prisma.alerta.findMany as any).mockResolvedValue([]);
      (prisma.marcaje.findMany as any).mockResolvedValue([]);

      const res = await estadoGeneralGET(makeReq("/api/centro-control/estado-general") as any);
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.tecnicos).toBeDefined();
      expect(json.ofActivas).toBeDefined();
      expect(json.alertas).toBeDefined();
      expect(json.mixActividad).toBeDefined();
      expect(json.kpis).toBeDefined();
    });

    it("Filtro por sucursal aplicado correctamente", async () => {
      (prisma.usuario.findMany as any).mockResolvedValue([]);
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([]);
      (prisma.alerta.findMany as any).mockResolvedValue([]);
      (prisma.marcaje.findMany as any).mockResolvedValue([]);

      await estadoGeneralGET(
        makeReq(
          "/api/centro-control/estado-general?sucursalId=550e8400-e29b-41d4-a716-446655440001"
        ) as any
      );

      expect(prisma.usuario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sucursalId: "550e8400-e29b-41d4-a716-446655440001" }),
        })
      );
    });
  });

  describe("OF timeline segmentos (/api/centro-control/of-timeline-segmentos)", () => {
    it("segmentos calculados correctamente desde marcajes", async () => {
      const horaInicio = new Date(Date.now() - 3600000); // 1 hr ago
      const horaFin = new Date(Date.now() - 1800000); // 30 min ago

      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([
        {
          id: "of-1",
          numero: "OF-1",
          nombre: "OF 1",
          estado: "EN_PROCESO",
          marcajes: [
            {
              id: "m1",
              horaInicio,
              horaFin,
              tipo: "INICIO",
              actividad: { nombre: "Diagnostico", color: "#ccc" },
              usuario: { nombre: "A", iniciales: "A" },
            },
          ],
        },
      ]);

      const res = await ofTimelineSegmentosGET(
        makeReq("/api/centro-control/of-timeline-segmentos?ofId=of-1") as any
      );
      expect(res.status).toBe(200);
      const json = await res.json();

      expect(json.data.length).toBe(1);
      expect(json.data[0].segmentos[0].actividad).toBe("Diagnostico");
    });

    it("último segmento activo tiene hasta='now'", async () => {
      const horaInicio = new Date(Date.now() - 3600000); // 1 hr ago

      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([
        {
          id: "of-1",
          numero: "OF-1",
          nombre: "OF 1",
          estado: "EN_PROCESO",
          marcajes: [
            {
              id: "m1",
              horaInicio,
              horaFin: null, // Activo
              tipo: "INICIO",
              actividad: { nombre: "Diagnostico", color: "#ccc" },
              usuario: { nombre: "A", iniciales: "A" },
            },
          ],
        },
      ]);

      const res = await ofTimelineSegmentosGET(
        makeReq("/api/centro-control/of-timeline-segmentos?ofId=of-1") as any
      );
      const json = await res.json();

      expect(json.data.length).toBe(1);
      expect(json.data[0].segmentos[0].hasta).toBe("now");
    });
  });

  describe("Mix actividad (/api/centro-control/mix-actividad)", () => {
    it("porcentajes suman ~100%", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          horaInicio: new Date(),
          horaFin: new Date(Date.now() + 1000),
          actividad: { id: "a1", nombre: "A" },
        },
        {
          horaInicio: new Date(),
          horaFin: new Date(Date.now() + 1000),
          actividad: { id: "a1", nombre: "A" },
        },
        {
          horaInicio: new Date(),
          horaFin: new Date(Date.now() + 1000),
          actividad: { id: "a2", nombre: "B" },
        },
      ]);
      (prisma.actividad.findMany as any).mockResolvedValue([
        { id: "a1", nombre: "A" },
        { id: "a2", nombre: "B" },
      ]);

      const res = await mixActividadGET(makeReq("/api/centro-control/mix-actividad") as any);
      expect(res.status).toBe(200);
      const json = await res.json();

      const totalPorcentaje = json.segmentos.reduce(
        (acc: number, item: any) => acc + item.porcentaje,
        0
      );
      expect(Math.round(totalPorcentaje)).toBe(100);
    });

    it("Filtro por sucursal aplicado correctamente en mix", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([]);
      (prisma.actividad.findMany as any).mockResolvedValue([]);

      await mixActividadGET(
        makeReq(
          "/api/centro-control/mix-actividad?sucursalId=550e8400-e29b-41d4-a716-446655440002"
        ) as any
      );

      expect(prisma.marcaje.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sucursalId: "550e8400-e29b-41d4-a716-446655440002" }),
        })
      );
    });
  });

  describe("Filtro por sucursal en otros endpoints", () => {
    it("Alertas activas aplica filtro", async () => {
      (prisma.alerta.findMany as any).mockResolvedValue([]);
      await alertasActivasGET(
        makeReq(
          "/api/centro-control/alertas-activas?sucursalId=550e8400-e29b-41d4-a716-446655440003"
        ) as any
      );
      expect(prisma.alerta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sucursalId: "550e8400-e29b-41d4-a716-446655440003" }),
        })
      );
    });

    it("KPIs aplica filtro", async () => {
      (prisma.usuario.count as any).mockResolvedValue(0);
      (prisma.marcaje.findMany as any).mockResolvedValue([]);
      (prisma.ordenTrabajo.count as any).mockResolvedValue(0);
      (prisma.alerta.groupBy as any).mockResolvedValue([]);

      await kpisGET(
        makeReq("/api/centro-control/kpis?sucursalId=550e8400-e29b-41d4-a716-446655440004") as any
      );
      expect(prisma.usuario.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sucursalId: "550e8400-e29b-41d4-a716-446655440004" }),
        })
      );
    });
  });
});
