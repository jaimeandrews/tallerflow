import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      actividad: { findFirst: vi.fn() },
      ordenTrabajo: { findFirst: vi.fn(), update: vi.fn() },
      marcaje: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      turno: { findFirst: vi.fn() },
      logAuditoria: { create: vi.fn().mockResolvedValue({ id: "log-1" }) },
      usuario: { findUnique: vi.fn().mockResolvedValue({ activo: true }) },
    },
  };
});

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: "user-1",
      nombre: "Carlos",
      apellido: "Mendoza",
      iniciales: "CM",
      rol: "TECNICO",
      sucursalId: "suc-1",
      color: "#0891B2",
    },
  }),
}));

process.env.AUTH_SECRET = "test-secret-for-vitest-only-do-not-use-prod";

import { POST as iniciarPOST } from "@/app/api/marcaje/iniciar/route";
import { POST as finalizarPOST } from "@/app/api/marcaje/finalizar/route";
import { POST as pausarPOST } from "@/app/api/marcaje/pausar/route";
import { GET as activoGET } from "@/app/api/marcaje/activo/route";
import { prisma } from "@/lib/db/prisma";

const ACT_ID = "550e8400-0000-4111-a111-446655440001";
const OF_ID = "550e8400-0000-4222-a111-446655440002";
const MARCAJE_ID = "550e8400-0000-4333-a111-446655440003";

const actividadMock = prisma.actividad.findFirst as ReturnType<typeof vi.fn>;
const ofFindFirstMock = prisma.ordenTrabajo.findFirst as ReturnType<typeof vi.fn>;
const ofUpdateMock = prisma.ordenTrabajo.update as ReturnType<typeof vi.fn>;
const marcajeFindFirst = prisma.marcaje.findFirst as ReturnType<typeof vi.fn>;
const marcajeFindUnique = prisma.marcaje.findUnique as ReturnType<typeof vi.fn>;
const marcajeCreate = prisma.marcaje.create as ReturnType<typeof vi.fn>;
const marcajeUpdate = prisma.marcaje.update as ReturnType<typeof vi.fn>;
const marcajeFindMany = prisma.marcaje.findMany as ReturnType<typeof vi.fn>;
const turnoFindFirst = prisma.turno.findFirst as ReturnType<typeof vi.fn>;

function makeReq(url: string, method: string, body?: object) {
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  return new Request(`http://localhost${url}`, init);
}

const ACTIVIDAD_MOCK = {
  id: ACT_ID,
  nombre: "Reparación",
  color: "#2563EB",
  icono: "wrench",
  productiva: true,
  activa: true,
  sucursalId: null,
};

beforeEach(() => {
  actividadMock.mockReset();
  ofFindFirstMock.mockReset();
  ofUpdateMock.mockReset();
  marcajeFindFirst.mockReset();
  marcajeFindUnique.mockReset();
  marcajeCreate.mockReset();
  marcajeUpdate.mockReset();
  marcajeFindMany.mockReset();
  turnoFindFirst.mockReset();

  // Default mocks
  actividadMock.mockResolvedValue(ACTIVIDAD_MOCK);
  marcajeFindFirst.mockResolvedValue(null); // no open marcaje
  marcajeFindUnique.mockResolvedValue(null); // no duplicate
  turnoFindFirst.mockResolvedValue({ id: "turno-1" });
  marcajeCreate.mockImplementation(
    async ({ data, select }: { data: Record<string, unknown>; select?: unknown }) => ({
      id: MARCAJE_ID,
      tipo: data.tipo,
      horaInicio: data.horaInicio,
      horaFin: data.horaFin ?? null,
      duracionMinutos: data.duracionMinutos ?? null,
      notas: data.notas ?? null,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    })
  );
});

// ─── /api/marcaje/iniciar ────────────────────────────────────────────────────

describe("POST /api/marcaje/iniciar", () => {
  it("crea un marcaje de inicio exitosamente", async () => {
    const res = await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", { actividadId: ACT_ID }) as Parameters<
        typeof iniciarPOST
      >[0]
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.marcaje).toBeDefined();
    expect(json.marcaje.tipo).toBe("INICIO");
  });

  it("retorna 401 sin autenticación", async () => {
    const { auth } = await import("@/lib/auth/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", { actividadId: ACT_ID }) as Parameters<
        typeof iniciarPOST
      >[0]
    );
    expect(res.status).toBe(401);
  });

  it("retorna 400 con datos inválidos (actividadId no UUID)", async () => {
    const res = await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", { actividadId: "invalid" }) as Parameters<
        typeof iniciarPOST
      >[0]
    );
    expect(res.status).toBe(400);
  });

  it("retorna 404 si la actividad no existe o no pertenece a la sucursal", async () => {
    actividadMock.mockResolvedValue(null);

    const res = await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", { actividadId: ACT_ID }) as Parameters<
        typeof iniciarPOST
      >[0]
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/actividad/i);
  });

  it("retorna 409 si idOffline ya existe (deduplicación)", async () => {
    marcajeFindUnique.mockResolvedValue({ id: "existing-m-1" });

    const res = await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", {
        actividadId: ACT_ID,
        idOffline: "dup-offline-id",
      }) as Parameters<typeof iniciarPOST>[0]
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/duplicado/i);
  });

  it("cierra marcaje abierto previo al iniciar uno nuevo", async () => {
    marcajeFindFirst.mockResolvedValue({
      id: "prev-marcaje",
      horaInicio: new Date(Date.now() - 3600_000),
      horaFin: null,
      actividad: ACTIVIDAD_MOCK,
    });

    await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", { actividadId: ACT_ID }) as Parameters<
        typeof iniciarPOST
      >[0]
    );

    // Should update the previous open marcaje to close it
    expect(marcajeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "prev-marcaje" },
        data: expect.objectContaining({
          horaFin: expect.any(Date),
          duracionMinutos: expect.any(Number),
        }),
      })
    );
    // And create the new one
    expect(marcajeCreate).toHaveBeenCalled();
  });

  it("verifica OF y rechaza 404 si no pertenece a la sucursal", async () => {
    ofFindFirstMock.mockResolvedValue(null);

    const res = await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", {
        actividadId: ACT_ID,
        ordenTrabajoId: OF_ID,
      }) as Parameters<typeof iniciarPOST>[0]
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/orden de trabajo/i);
  });

  it("rechaza OF con estado FINALIZADA", async () => {
    ofFindFirstMock.mockResolvedValue({ id: OF_ID, estado: "FINALIZADA", sucursalId: "suc-1" });

    const res = await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", {
        actividadId: ACT_ID,
        ordenTrabajoId: OF_ID,
      }) as Parameters<typeof iniciarPOST>[0]
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/finalizada/i);
  });

  it("cambia OF de PENDIENTE a EN_PROCESO automáticamente", async () => {
    ofFindFirstMock.mockResolvedValue({ id: OF_ID, estado: "PENDIENTE", sucursalId: "suc-1" });

    await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", {
        actividadId: ACT_ID,
        ordenTrabajoId: OF_ID,
      }) as Parameters<typeof iniciarPOST>[0]
    );

    expect(ofUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OF_ID },
        data: { estado: "EN_PROCESO" },
      })
    );
  });

  it("marca creadoOffline=true cuando se envía idOffline", async () => {
    await iniciarPOST(
      makeReq("/api/marcaje/iniciar", "POST", {
        actividadId: ACT_ID,
        idOffline: "offline-123",
      }) as Parameters<typeof iniciarPOST>[0]
    );

    const createData = (marcajeCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(createData.creadoOffline).toBe(true);
    expect(createData.idOffline).toBe("offline-123");
  });
});

// ─── /api/marcaje/finalizar ──────────────────────────────────────────────────

describe("POST /api/marcaje/finalizar", () => {
  it("cierra el marcaje activo y retorna duracion", async () => {
    marcajeFindFirst.mockResolvedValue({
      id: MARCAJE_ID,
      horaInicio: new Date(Date.now() - 3600_000),
      horaFin: null,
      ordenTrabajoId: null,
      actividad: ACTIVIDAD_MOCK,
    });
    marcajeUpdate.mockResolvedValue({
      id: MARCAJE_ID,
      tipo: "FIN",
      horaInicio: new Date(Date.now() - 3600_000),
      horaFin: new Date(),
      duracionMinutos: 60,
      notas: null,
      ordenTrabajoId: null,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    });

    const res = await finalizarPOST(
      makeReq("/api/marcaje/finalizar", "POST", {}) as Parameters<typeof finalizarPOST>[0]
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marcaje).toBeDefined();
    expect(json.marcaje.tipo).toBe("FIN");
  });

  it("retorna 400 si no hay marcaje activo", async () => {
    marcajeFindFirst.mockResolvedValue(null);

    const res = await finalizarPOST(
      makeReq("/api/marcaje/finalizar", "POST", {}) as Parameters<typeof finalizarPOST>[0]
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no hay marcaje activo/i);
  });

  it("retorna 401 sin sesión", async () => {
    const { auth } = await import("@/lib/auth/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await finalizarPOST(
      makeReq("/api/marcaje/finalizar", "POST", {}) as Parameters<typeof finalizarPOST>[0]
    );
    expect(res.status).toBe(401);
  });

  it("recalcula hhConsumidas de la OF asociada", async () => {
    marcajeFindFirst.mockResolvedValue({
      id: MARCAJE_ID,
      horaInicio: new Date(Date.now() - 3600_000),
      horaFin: null,
      ordenTrabajoId: OF_ID,
      actividad: ACTIVIDAD_MOCK,
    });
    marcajeUpdate.mockResolvedValue({
      id: MARCAJE_ID,
      tipo: "FIN",
      horaInicio: new Date(),
      horaFin: new Date(),
      duracionMinutos: 60,
      notas: null,
      ordenTrabajoId: OF_ID,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: { id: OF_ID, numero: "OF-001", nombre: "Test", cliente: "C" },
    });
    marcajeFindMany.mockResolvedValue([{ duracionMinutos: 60 }, { duracionMinutos: 120 }]);

    await finalizarPOST(
      makeReq("/api/marcaje/finalizar", "POST", {}) as Parameters<typeof finalizarPOST>[0]
    );

    expect(ofUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: OF_ID },
        data: { hhConsumidas: 3 }, // (60 + 120) / 60
      })
    );
  });

  it("almacena notas en el marcaje cerrado", async () => {
    marcajeFindFirst.mockResolvedValue({
      id: MARCAJE_ID,
      horaInicio: new Date(),
      horaFin: null,
      ordenTrabajoId: null,
      actividad: ACTIVIDAD_MOCK,
    });
    marcajeUpdate.mockResolvedValue({
      id: MARCAJE_ID,
      tipo: "FIN",
      horaInicio: new Date(),
      horaFin: new Date(),
      duracionMinutos: 0,
      notas: "trabajo completo",
      ordenTrabajoId: null,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    });

    await finalizarPOST(
      makeReq("/api/marcaje/finalizar", "POST", { notas: "trabajo completo" }) as Parameters<
        typeof finalizarPOST
      >[0]
    );

    const updateData = (marcajeUpdate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(updateData.notas).toBe("trabajo completo");
  });
});

// ─── /api/marcaje/pausar ─────────────────────────────────────────────────────

describe("POST /api/marcaje/pausar", () => {
  it("cierra el marcaje activo y crea uno de tipo PAUSA", async () => {
    marcajeFindFirst.mockResolvedValue({
      id: MARCAJE_ID,
      horaInicio: new Date(Date.now() - 1800_000),
      horaFin: null,
      actividadId: ACT_ID,
      ordenTrabajoId: null,
      sucursalId: "suc-1",
      turnoId: "turno-1",
      actividad: ACTIVIDAD_MOCK,
    });
    marcajeUpdate.mockResolvedValue({
      id: MARCAJE_ID,
      tipo: "INICIO",
      horaInicio: new Date(),
      horaFin: new Date(),
      duracionMinutos: 30,
      notas: null,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    });
    marcajeCreate.mockResolvedValue({
      id: "pause-marcaje-id",
      tipo: "PAUSA",
      horaInicio: new Date(),
      horaFin: null,
      duracionMinutos: null,
      notas: "descanso",
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    });

    const res = await pausarPOST(
      makeReq("/api/marcaje/pausar", "POST", { motivo: "descanso" }) as Parameters<
        typeof pausarPOST
      >[0]
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marcajeCerrado).toBeDefined();
    expect(json.marcajePausa).toBeDefined();
    expect(json.marcajePausa.tipo).toBe("PAUSA");
  });

  it("retorna 400 si no hay marcaje activo para pausar", async () => {
    marcajeFindFirst.mockResolvedValue(null);

    const res = await pausarPOST(
      makeReq("/api/marcaje/pausar", "POST", {}) as Parameters<typeof pausarPOST>[0]
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no hay marcaje activo/i);
  });

  it("retorna 401 sin sesión", async () => {
    const { auth } = await import("@/lib/auth/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await pausarPOST(
      makeReq("/api/marcaje/pausar", "POST", {}) as Parameters<typeof pausarPOST>[0]
    );
    expect(res.status).toBe(401);
  });

  it("el marcaje de pausa hereda actividadId y ordenTrabajoId del activo", async () => {
    marcajeFindFirst.mockResolvedValue({
      id: MARCAJE_ID,
      horaInicio: new Date(),
      horaFin: null,
      actividadId: ACT_ID,
      ordenTrabajoId: OF_ID,
      sucursalId: "suc-1",
      turnoId: "turno-1",
      actividad: ACTIVIDAD_MOCK,
    });
    marcajeUpdate.mockResolvedValue({
      id: MARCAJE_ID,
      tipo: "INICIO",
      horaInicio: new Date(),
      horaFin: new Date(),
      duracionMinutos: 0,
      notas: null,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    });
    marcajeCreate.mockResolvedValue({
      id: "pause-id",
      tipo: "PAUSA",
      horaInicio: new Date(),
      horaFin: null,
      duracionMinutos: null,
      notas: null,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    });

    await pausarPOST(
      makeReq("/api/marcaje/pausar", "POST", {}) as Parameters<typeof pausarPOST>[0]
    );

    const createData = (marcajeCreate.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(createData.actividadId).toBe(ACT_ID);
    expect(createData.ordenTrabajoId).toBe(OF_ID);
    expect(createData.tipo).toBe("PAUSA");
  });
});

// ─── /api/marcaje/activo ─────────────────────────────────────────────────────

describe("GET /api/marcaje/activo", () => {
  it("retorna el marcaje abierto con duracionVivo", async () => {
    const horaInicio = new Date(Date.now() - 60_000); // 1 min ago
    marcajeFindFirst.mockResolvedValue({
      id: MARCAJE_ID,
      tipo: "INICIO",
      horaInicio,
      horaFin: null,
      duracionMinutos: null,
      notas: null,
      actividad: ACTIVIDAD_MOCK,
      ordenTrabajo: null,
    });

    const res = await activoGET(
      makeReq("/api/marcaje/activo", "GET") as Parameters<typeof activoGET>[0]
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marcaje).toBeDefined();
    expect(json.marcaje.duracionVivo).toBeGreaterThanOrEqual(59); // ~60 seconds
    expect(json.marcaje.duracionVivo).toBeLessThanOrEqual(62);
  });

  it("retorna { marcaje: null } si no hay marcaje abierto", async () => {
    marcajeFindFirst.mockResolvedValue(null);

    const res = await activoGET(
      makeReq("/api/marcaje/activo", "GET") as Parameters<typeof activoGET>[0]
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.marcaje).toBeNull();
  });

  it("retorna 401 sin sesión", async () => {
    const { auth } = await import("@/lib/auth/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await activoGET(
      makeReq("/api/marcaje/activo", "GET") as Parameters<typeof activoGET>[0]
    );
    expect(res.status).toBe(401);
  });
});
