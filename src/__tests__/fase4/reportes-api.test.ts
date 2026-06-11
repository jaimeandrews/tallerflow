import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    marcaje: {
      findMany: vi.fn(),
    },
    sucursal: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    usuario: {
      count: vi.fn(),
    },
    ordenTrabajo: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  getAuthUser: vi.fn(),
}));

vi.mock("@react-pdf/renderer", () => {
  const StyleSheet = {
    create: vi.fn((styles) => styles),
  };
  const Document = vi.fn(({ children }) => children);
  const Page = vi.fn(({ children }) => children);
  const Text = vi.fn(({ children }) => children);
  const View = vi.fn(({ children }) => children);

  return {
    StyleSheet,
    Document,
    Page,
    Text,
    View,
    default: {
      renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("dummy-pdf")),
    },
  };
});

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { GET as getProductividadTecnicos } from "@/app/api/reportes/productividad-tecnicos/route";
import { GET as getProductividadOF } from "@/app/api/reportes/productividad-of/route";
import { GET as getProductividadSucursal } from "@/app/api/reportes/productividad-sucursal/route";
import { GET as getResumenPeriodo } from "@/app/api/reportes/resumen-periodo/route";
import { GET as exportarGET } from "@/app/api/reportes/exportar/route";

import { NextRequest } from "next/server";

function makeReq(url: string) {
  return new NextRequest(`http://localhost${url}`);
}

const VALID_SUCURSAL_ID = "550e8400-e29b-41d4-a716-446655440000";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.marcaje.findMany as any).mockReset();
  (prisma.sucursal.findMany as any).mockReset();
  (prisma.sucursal.findUnique as any).mockReset();
  (prisma.usuario.count as any).mockReset();
  (prisma.ordenTrabajo.findMany as any).mockReset();
  (getAuthUser as any).mockReset();

  (getAuthUser as any).mockResolvedValue({
    id: "user-1",
    rol: "ADMIN",
    sucursalId: VALID_SUCURSAL_ID,
    nombre: "Admin",
  });
});

describe("Reportes API", () => {
  describe("Productividad Técnicos", () => {
    it("retorna array con cálculos correctos", async () => {
      const mockMarcajes = [
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T12:00:00Z"), // 4 horas
          ordenTrabajoId: "ot-1",
          actividad: { id: "act-1", nombre: "Soldadura", color: "blue", productiva: true },
          usuario: { nombre: "Juan", apellido: "Perez", iniciales: "JP", color: "red" },
        },
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-19T13:00:00Z"),
          horaFin: new Date("2026-05-19T15:00:00Z"), // 2 horas
          ordenTrabajoId: null,
          actividad: { id: "act-2", nombre: "Limpieza", color: "gray", productiva: false },
          usuario: { nombre: "Juan", apellido: "Perez", iniciales: "JP", color: "red" },
        },
      ];

      (prisma.marcaje.findMany as any).mockResolvedValue(mockMarcajes);

      const req = makeReq("/api/reportes/productividad-tecnicos?desde=2026-05-19&hasta=2026-05-19");
      const res = await getProductividadTecnicos(req);
      expect(res.status).toBe(200);

      const { data } = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].tecnicoId).toBe("tec-1");
      expect(data[0].hhProductivas).toBe(4);
      expect(data[0].hhNoProductivas).toBe(2);
      expect(data[0].hhTotal).toBe(6);
      expect(data[0].productividad).toBe(67); // 4 / 6 = 66.67% -> r0(66.67) = 67
      expect(data[0].ofAtendidas).toBe(1);
    });

    it("hhProductivas solo cuenta actividades con productiva=true", async () => {
      const mockMarcajes = [
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T10:00:00Z"),
          ordenTrabajoId: "ot-1",
          actividad: { id: "act-1", nombre: "Soldadura", color: "blue", productiva: true },
          usuario: { nombre: "Juan", apellido: "Perez", iniciales: "JP", color: "red" },
        },
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-19T10:00:00Z"),
          horaFin: new Date("2026-05-19T12:00:00Z"),
          ordenTrabajoId: null,
          actividad: { id: "act-2", nombre: "Limpieza", color: "gray", productiva: false },
          usuario: { nombre: "Juan", apellido: "Perez", iniciales: "JP", color: "red" },
        },
      ];

      (prisma.marcaje.findMany as any).mockResolvedValue(mockMarcajes);

      const req = makeReq("/api/reportes/productividad-tecnicos?desde=2026-05-19&hasta=2026-05-19");
      const res = await getProductividadTecnicos(req);
      const { data } = await res.json();

      expect(data[0].hhProductivas).toBe(2);
      expect(data[0].hhNoProductivas).toBe(2);
    });

    it("tendencia tiene un punto por día del rango", async () => {
      const mockMarcajes = [
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-18T08:00:00Z"),
          horaFin: new Date("2026-05-18T12:00:00Z"),
          ordenTrabajoId: "ot-1",
          actividad: { id: "act-1", nombre: "Soldadura", color: "blue", productiva: true },
          usuario: { nombre: "Juan", apellido: "Perez", iniciales: "JP", color: "red" },
        },
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T12:00:00Z"),
          ordenTrabajoId: "ot-1",
          actividad: { id: "act-1", nombre: "Soldadura", color: "blue", productiva: true },
          usuario: { nombre: "Juan", apellido: "Perez", iniciales: "JP", color: "red" },
        },
      ];

      (prisma.marcaje.findMany as any).mockResolvedValue(mockMarcajes);

      const req = makeReq("/api/reportes/productividad-tecnicos?desde=2026-05-18&hasta=2026-05-20");
      const res = await getProductividadTecnicos(req);
      const { data } = await res.json();

      // Rango del 18 al 20 de mayo es 3 días -> tendencia debe tener 3 puntos
      expect(data[0].tendencia).toHaveLength(3);
    });

    it("filtro por tecnicoId retorna solo ese técnico", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([]);

      const VALID_TECNICO_ID = "550e8400-e29b-41d4-a716-446655440002";
      const req = makeReq(
        `/api/reportes/productividad-tecnicos?desde=2026-05-19&hasta=2026-05-19&tecnicoId=${VALID_TECNICO_ID}`
      );
      await getProductividadTecnicos(req);

      expect(prisma.marcaje.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            usuarioId: VALID_TECNICO_ID,
          }),
        })
      );
    });
  });

  describe("Productividad OF", () => {
    it("desviación positiva cuando hhConsumidas > hhEstimadas", async () => {
      const mockMarcajes = [
        {
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T18:00:00Z"), // 10 horas
          usuarioId: "tec-1",
          ordenTrabajoId: "ot-1",
          actividad: { productiva: true },
          usuario: {
            id: "tec-1",
            nombre: "Juan",
            apellido: "Perez",
            iniciales: "JP",
            color: "red",
          },
          ordenTrabajo: {
            id: "ot-1",
            numero: "OF-100",
            nombre: "Mantencion",
            cliente: "Cliente A",
            equipo: "Equipo A",
            estado: "EN_PROCESO",
            prioridad: "ALTA",
            hhEstimadas: 8,
            hhConsumidas: 10,
            slaVencimiento: null,
            createdAt: new Date("2026-05-19T00:00:00Z"),
            updatedAt: new Date("2026-05-19T18:00:00Z"),
          },
        },
      ];

      (prisma.marcaje.findMany as any).mockResolvedValue(mockMarcajes);

      const req = makeReq("/api/reportes/productividad-of?desde=2026-05-19&hasta=2026-05-19");
      const res = await getProductividadOF(req);
      const { data } = await res.json();

      expect(data[0].desviacion).toBe(2); // 10 - 8 = 2
      expect(data[0].desviacionPorcentaje).toBe(25); // 2/8 * 100 = 25%
    });

    it("eficiencia > 100% cuando se finaliza antes de lo estimado", async () => {
      const mockMarcajes = [
        {
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T12:00:00Z"), // 4 horas
          usuarioId: "tec-1",
          ordenTrabajoId: "ot-1",
          actividad: { productiva: true },
          usuario: {
            id: "tec-1",
            nombre: "Juan",
            apellido: "Perez",
            iniciales: "JP",
            color: "red",
          },
          ordenTrabajo: {
            id: "ot-1",
            numero: "OF-100",
            nombre: "Mantencion",
            cliente: "Cliente A",
            equipo: "Equipo A",
            estado: "FINALIZADA",
            prioridad: "ALTA",
            hhEstimadas: 8,
            hhConsumidas: 4,
            slaVencimiento: null,
            createdAt: new Date("2026-05-19T00:00:00Z"),
            updatedAt: new Date("2026-05-19T12:00:00Z"),
          },
        },
      ];

      (prisma.marcaje.findMany as any).mockResolvedValue(mockMarcajes);

      const req = makeReq("/api/reportes/productividad-of?desde=2026-05-19&hasta=2026-05-19");
      const res = await getProductividadOF(req);
      const { data } = await res.json();

      expect(data[0].eficiencia).toBe(200); // 8/4 * 100 = 200%
    });

    it('slaStatus "vencido" cuando slaVencimiento < now y no finalizada', async () => {
      const mockMarcajes = [
        {
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: null,
          usuarioId: "tec-1",
          ordenTrabajoId: "ot-1",
          actividad: { productiva: true },
          usuario: {
            id: "tec-1",
            nombre: "Juan",
            apellido: "Perez",
            iniciales: "JP",
            color: "red",
          },
          ordenTrabajo: {
            id: "ot-1",
            numero: "OF-100",
            nombre: "Mantencion",
            cliente: "Cliente A",
            equipo: "Equipo A",
            estado: "EN_PROCESO",
            prioridad: "ALTA",
            hhEstimadas: 8,
            hhConsumidas: 2,
            slaVencimiento: new Date("2026-05-19T10:00:00Z"), // Vencido
            createdAt: new Date("2026-05-19T00:00:00Z"),
            updatedAt: new Date("2026-05-19T10:00:00Z"),
          },
        },
      ];

      (prisma.marcaje.findMany as any).mockResolvedValue(mockMarcajes);

      // Mock Date.now() to a time after slaVencimiento
      const realNow = Date.now;
      Date.now = () => new Date("2026-05-19T12:00:00Z").getTime();

      try {
        const req = makeReq("/api/reportes/productividad-of?desde=2026-05-19&hasta=2026-05-19");
        const res = await getProductividadOF(req);
        const { data } = await res.json();
        expect(data[0].slaStatus).toBe("vencido");
      } finally {
        Date.now = realNow;
      }
    });
  });

  describe("Productividad Sucursales", () => {
    it("retorna las sucursales con métricas", async () => {
      const mockSucursales = [
        { id: VALID_SUCURSAL_ID, nombre: "Santiago" },
        { id: "550e8400-e29b-41d4-a716-446655440001", nombre: "Antofagasta" },
      ];
      (prisma.sucursal.findMany as any).mockResolvedValue(mockSucursales);
      (prisma.usuario.count as any).mockResolvedValue(5); // tecnicosActivos
      (prisma.marcaje.findMany as any).mockResolvedValue([]);
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([]);

      const req = makeReq("/api/reportes/productividad-sucursal?desde=2026-05-19&hasta=2026-05-19");
      const res = await getProductividadSucursal(req);
      expect(res.status).toBe(200);

      const { data } = await res.json();
      expect(data).toHaveLength(2);
      expect(data[0].nombre).toBe("Santiago");
      expect(data[0].tecnicosActivos).toBe(5);
    });

    it("solo accesible para ADMIN, GERENTE_SUCURSAL, CONTROL_GESTION", async () => {
      const validRoles = ["ADMIN", "GERENTE_SUCURSAL", "CONTROL_GESTION"];

      for (const rol of validRoles) {
        (getAuthUser as any).mockResolvedValueOnce({
          id: "user-1",
          rol,
          sucursalId: VALID_SUCURSAL_ID,
        });
        (prisma.sucursal.findMany as any).mockResolvedValue([]);

        const req = makeReq(
          "/api/reportes/productividad-sucursal?desde=2026-05-19&hasta=2026-05-19"
        );
        const res = await getProductividadSucursal(req);
        expect(res.status).toBe(200);
      }
    });

    it("TECNICO recibe 403", async () => {
      (getAuthUser as any).mockResolvedValue({
        id: "user-1",
        rol: "TECNICO",
        sucursalId: VALID_SUCURSAL_ID,
      });

      const req = makeReq("/api/reportes/productividad-sucursal?desde=2026-05-19&hasta=2026-05-19");
      const res = await getProductividadSucursal(req);
      expect(res.status).toBe(403);
    });
  });

  describe("Resumen Periodo", () => {
    it("tecnicoMasProductivo es el correcto", async () => {
      const mockMarcajes = [
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T16:00:00Z"), // 8 horas productivas
          actividad: { id: "act-1", nombre: "Soldadura", productiva: true },
          usuario: { nombre: "Juan", apellido: "Perez" },
        },
        {
          usuarioId: "tec-2",
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T12:00:00Z"), // 4 horas productivas
          actividad: { id: "act-1", nombre: "Soldadura", productiva: true },
          usuario: { nombre: "Pedro", apellido: "Gomez" },
        },
      ];

      (prisma.marcaje.findMany as any).mockResolvedValue(mockMarcajes);
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([]);

      const req = makeReq("/api/reportes/resumen-periodo?desde=2026-05-19&hasta=2026-05-19");
      const res = await getResumenPeriodo(req);
      expect(res.status).toBe(200);

      const resumen = await res.json();
      expect(resumen.tecnicoMasProductivo?.nombre).toBe("Juan Perez");
      expect(resumen.tecnicoMasProductivo?.hh).toBe(8);
    });
  });

  describe("Exportar", () => {
    it("CSV: retorna content-type text/csv con BOM UTF-8 y headers en español con separador ;", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          usuarioId: "tec-1",
          horaInicio: new Date("2026-05-19T08:00:00Z"),
          horaFin: new Date("2026-05-19T12:00:00Z"),
          ordenTrabajoId: "ot-1",
          actividad: { id: "act-1", nombre: "Soldadura", color: "blue", productiva: true },
          usuario: { nombre: "Juan", apellido: "Perez", iniciales: "JP", color: "red" },
        },
      ]);

      const req = makeReq(
        "/api/reportes/exportar?tipo=tecnicos&formato=csv&desde=2026-05-19&hasta=2026-05-19"
      );
      const res = await exportarGET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/csv");

      const buffer = await res.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      // El BOM UTF-8 es 0xEF, 0xBB, 0xBF (239, 187, 191)
      expect(bytes[0]).toBe(239);
      expect(bytes[1]).toBe(187);
      expect(bytes[2]).toBe(191);

      // Decodificar el resto del texto para verificar contenido
      const text = new TextDecoder("utf-8").decode(bytes.slice(3));
      // Contiene cabeceras en español con separador ;
      expect(text).toContain("Técnico;Iniciales;HH Productivas;HH No Productivas");
    });

    it("PDF: retorna content-type application/pdf", async () => {
      (prisma.marcaje.findMany as any).mockResolvedValue([]);
      (prisma.sucursal.findUnique as any).mockResolvedValue({ nombre: "Santiago" });

      const req = makeReq(
        "/api/reportes/exportar?tipo=tecnicos&formato=pdf&desde=2026-05-19&hasta=2026-05-19"
      );
      const res = await exportarGET(req);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
    });
  });
});
