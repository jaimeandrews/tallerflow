import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluarAlertas, resolverAlerta } from "@/lib/services/alerta-service";
import { prisma } from "@/lib/db/prisma";
import { socketEmit } from "@/lib/socket/socket-emitter";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    configuracionSLA: { findMany: vi.fn() },
    marcaje: { findMany: vi.fn() },
    ordenTrabajo: { findMany: vi.fn() },
    alerta: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/socket/socket-emitter", () => ({
  socketEmit: {
    alertaNueva: vi.fn(),
    alertaResuelta: vi.fn(),
  },
}));

vi.mock("@/lib/services/auditoria-service", () => ({
  registrarAuditoria: vi.fn(),
}));

const SUCURSAL_ID = "sucursal-1";
const SLA_ID = "sla-1";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.alerta.findMany as any).mockResolvedValue([]);
  (prisma.alerta.create as any).mockImplementation(async (args: any) => ({
    id: "alerta-" + Date.now(),
    ...args.data,
    createdAt: new Date(),
  }));
});

describe("alerta-service", () => {
  describe("evaluarAlertas - tecnico_detenido", () => {
    it("Técnico detenido > umbral -> genera alerta", async () => {
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([
        {
          id: SLA_ID,
          condicion: "tecnico_detenido",
          umbralMinutos: 30,
          nivelAlerta: "critico",
          nombre: "Técnico detenido",
        },
      ]);

      const cutoff = new Date(Date.now() - 40 * 60_000); // 40 mins ago
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          usuarioId: "tec-1",
          horaInicio: cutoff,
          usuario: { nombre: "Juan", apellido: "Perez" },
          ordenTrabajo: { numero: "OF-1" },
        },
      ]);

      const result = await evaluarAlertas(SUCURSAL_ID);

      expect(result.length).toBe(1);
      expect(prisma.alerta.create).toHaveBeenCalled();
      expect(socketEmit.alertaNueva).toHaveBeenCalled();
    });

    it("Técnico detenido < umbral -> NO genera alerta", async () => {
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([
        {
          id: SLA_ID,
          condicion: "tecnico_detenido",
          umbralMinutos: 30,
          nivelAlerta: "critico",
          nombre: "Técnico detenido",
        },
      ]);

      const cutoff = new Date(Date.now() - 20 * 60_000); // 20 mins ago (less than 30)
      (prisma.marcaje.findMany as any).mockResolvedValue([
        // Note: The service searches for `horaInicio: { lte: cutoff }`,
        // where cutoff is (now - umbral). If the query returns nothing, no alerts are generated.
        // We simulate the DB returning nothing because the mock is just an array, but
        // in reality the service's findMany would filter it. To properly test this with mocks:
      ]);

      const result = await evaluarAlertas(SUCURSAL_ID);

      expect(result.length).toBe(0);
      expect(prisma.alerta.create).not.toHaveBeenCalled();
    });
  });

  describe("evaluarAlertas - of_sobre_sla", () => {
    it("OF sobre SLA -> genera alerta", async () => {
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([
        {
          id: SLA_ID,
          condicion: "of_sobre_sla",
          umbralMinutos: 0,
          nivelAlerta: "warning",
          nombre: "OF Vencida",
        },
      ]);

      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([
        {
          id: "of-1",
          numero: "OF-1",
          nombre: "Mantencion",
          estado: "EN_PROCESO",
          slaVencimiento: new Date(Date.now() - 10 * 60_000), // Vencida hace 10 min
        },
      ]);

      const result = await evaluarAlertas(SUCURSAL_ID);

      expect(result.length).toBe(1);
      expect(prisma.alerta.create).toHaveBeenCalled();
    });

    it("OF sobre SLA pero ya finalizada -> NO genera alerta", async () => {
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([
        {
          id: SLA_ID,
          condicion: "of_sobre_sla",
          umbralMinutos: 0,
          nivelAlerta: "warning",
          nombre: "OF Vencida",
        },
      ]);

      // DB shouldn't return it due to `{ not: "FINALIZADA" }` filter
      (prisma.ordenTrabajo.findMany as any).mockResolvedValue([]);

      const result = await evaluarAlertas(SUCURSAL_ID);

      expect(result.length).toBe(0);
      expect(prisma.alerta.create).not.toHaveBeenCalled();
    });
  });

  describe("evaluarAlertas - técnico_pausa_larga", () => {
    it("Técnico en pausa larga > umbral -> genera alerta", async () => {
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([
        {
          id: SLA_ID,
          condicion: "tecnico_pausa_larga",
          umbralMinutos: 15,
          nivelAlerta: "info",
          nombre: "Pausa Larga",
        },
      ]);

      const cutoff = new Date(Date.now() - 20 * 60_000);
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          usuarioId: "tec-1",
          horaInicio: cutoff,
          notas: "Colación",
          usuario: { nombre: "Juan", apellido: "Perez" },
        },
      ]);

      const result = await evaluarAlertas(SUCURSAL_ID);

      expect(result.length).toBe(1);
      expect(prisma.alerta.create).toHaveBeenCalled();
    });
  });

  describe("evaluarAlertas - duplicados", () => {
    it("Alerta duplicada -> NO crea otra", async () => {
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([
        {
          id: SLA_ID,
          condicion: "tecnico_detenido",
          umbralMinutos: 30,
          nivelAlerta: "critico",
          nombre: "Técnico detenido",
        },
      ]);

      const cutoff = new Date(Date.now() - 40 * 60_000);
      (prisma.marcaje.findMany as any).mockResolvedValue([
        {
          usuarioId: "tec-1",
          horaInicio: cutoff,
          usuario: { nombre: "Juan", apellido: "Perez" },
        },
      ]);

      (prisma.alerta.findMany as any).mockResolvedValue([
        {
          id: "alerta-previa",
          datos: JSON.stringify({ tecnicoId: "tec-1" }),
        },
      ]);

      const result = await evaluarAlertas(SUCURSAL_ID);

      expect(result.length).toBe(0);
      expect(prisma.alerta.create).not.toHaveBeenCalled();
    });
  });

  describe("evaluarAlertas - 0 reglas", () => {
    it("Evaluar alertas con 0 reglas configuradas -> retorna array vacío", async () => {
      (prisma.configuracionSLA.findMany as any).mockResolvedValue([]);

      const result = await evaluarAlertas(SUCURSAL_ID);

      expect(result).toEqual([]);
      expect(prisma.alerta.create).not.toHaveBeenCalled();
    });
  });

  describe("resolverAlerta", () => {
    it("Resolver alerta -> marca resuelta con usuario y timestamp", async () => {
      (prisma.alerta.findUnique as any).mockResolvedValue({
        id: "a-1",
        sucursalId: SUCURSAL_ID,
        resuelta: false,
      });

      (prisma.alerta.update as any).mockResolvedValue({
        id: "a-1",
        resuelta: true,
      });

      const res = await resolverAlerta({
        alertaId: "a-1",
        usuarioId: "u-1",
        usuarioNombre: "Admin",
      });

      expect(res.ok).toBe(true);
      expect(prisma.alerta.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "a-1" },
          data: expect.objectContaining({ resuelta: true, resueltaPorId: "u-1" }),
        })
      );
      expect(socketEmit.alertaResuelta).toHaveBeenCalledWith(SUCURSAL_ID, expect.any(Object));
    });
  });
});
