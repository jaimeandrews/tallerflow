import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma BEFORE importing the route
vi.mock("@/lib/db/prisma", () => {
  const marcajeStore: Record<string, unknown> = {};
  return {
    prisma: {
      actividad: { findMany: vi.fn() },
      ordenTrabajo: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      marcaje: {
        findMany: vi.fn(),
        findUnique: vi.fn(async ({ where }: { where: { idOffline: string } }) => {
          return marcajeStore[where.idOffline] ?? null;
        }),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const created = { ...data, id: `m-${Object.keys(marcajeStore).length}` };
          marcajeStore[data.idOffline as string] = created;
          return created;
        }),
      },
      logAuditoria: { create: vi.fn().mockResolvedValue({ id: "log-1" }) },
      usuario: { findUnique: vi.fn().mockResolvedValue({ activo: true }) },
    },
  };
});

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: "user-1",
      nombre: "Test",
      apellido: "User",
      iniciales: "TU",
      rol: "TECNICO",
      sucursalId: "550e8400-e29b-41d4-a716-446655440000",
      color: "#000",
    },
  }),
}));

process.env.AUTH_SECRET = "test-secret-for-vitest-only-do-not-use-prod";

import { POST } from "@/app/api/marcaje/sync-offline/route";
import { prisma } from "@/lib/db/prisma";

const SUC = "550e8400-e29b-41d4-a716-446655440000";
const ACT = "550e8400-0000-4111-a111-446655440000";
const OF = "550e8400-0000-4222-a111-446655440000";

const actMock = prisma.actividad.findMany as ReturnType<typeof vi.fn>;
const ofMock = prisma.ordenTrabajo.findMany as ReturnType<typeof vi.fn>;
const marcajeFindMany = prisma.marcaje.findMany as ReturnType<typeof vi.fn>;
const marcajeCreate = prisma.marcaje.create as ReturnType<typeof vi.fn>;
const marcajeFindUnique = prisma.marcaje.findUnique as ReturnType<typeof vi.fn>;

beforeEach(() => {
  actMock.mockReset();
  ofMock.mockReset();
  marcajeFindMany.mockReset();
  marcajeCreate.mockClear();
  marcajeFindUnique.mockReset();

  actMock.mockResolvedValue([{ id: ACT }]);
  ofMock.mockResolvedValue([{ id: OF, estado: "EN_PROCESO" }]);
  marcajeFindMany.mockResolvedValue([]);
  marcajeFindUnique.mockResolvedValue(null);
});

function makeReq(body: object) {
  return new Request("http://localhost/api/marcaje/sync-offline", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/marcaje/sync-offline — validación de bounds y scoping", () => {
  it("rechaza horaInicio en el futuro", async () => {
    const future = new Date(Date.now() + 10 * 60_000).toISOString();
    const res = await POST(
      makeReq({
        marcajes: [{ idOffline: "off-1", actividadId: ACT, tipo: "INICIO", horaInicio: future }],
      }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.sincronizados).toBe(0);
    expect(json.errores[0]).toMatch(/fuera de rango/);
  });

  it("rechaza horaInicio >24h en el pasado", async () => {
    const old = new Date(Date.now() - 25 * 60 * 60_000).toISOString();
    const res = await POST(
      makeReq({
        marcajes: [{ idOffline: "off-1", actividadId: ACT, tipo: "INICIO", horaInicio: old }],
      }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.errores[0]).toMatch(/fuera de rango/);
  });

  it("rechaza actividad que no pertenece a la sucursal", async () => {
    actMock.mockResolvedValue([]); // no actividades scoped to user's sucursal
    const res = await POST(
      makeReq({
        marcajes: [
          {
            idOffline: "off-1",
            actividadId: ACT,
            tipo: "INICIO",
            horaInicio: new Date().toISOString(),
          },
        ],
      }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.errores[0]).toMatch(/sucursal/);
  });

  it("rechaza OF de otra sucursal", async () => {
    ofMock.mockResolvedValue([]); // OF doesn't exist for user's sucursal
    const res = await POST(
      makeReq({
        marcajes: [
          {
            idOffline: "off-1",
            actividadId: ACT,
            ordenTrabajoId: OF,
            tipo: "INICIO",
            horaInicio: new Date().toISOString(),
          },
        ],
      }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.errores[0]).toMatch(/sucursal/);
  });

  it("registra como huérfano si la OF está FINALIZADA", async () => {
    ofMock.mockResolvedValue([{ id: OF, estado: "FINALIZADA" }]);
    const res = await POST(
      makeReq({
        marcajes: [
          {
            idOffline: "off-1",
            actividadId: ACT,
            ordenTrabajoId: OF,
            tipo: "INICIO",
            horaInicio: new Date().toISOString(),
          },
        ],
      }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.errores[0]).toMatch(/huérfano|finalizada/i);
  });

  it("procesa marcajes en orden cronológico ascendente", async () => {
    const t0 = Date.now();
    const items = [
      {
        idOffline: "late",
        actividadId: ACT,
        tipo: "FIN" as const,
        horaInicio: new Date(t0 - 1 * 60_000).toISOString(),
        horaFin: new Date(t0).toISOString(),
      },
      {
        idOffline: "early",
        actividadId: ACT,
        tipo: "INICIO" as const,
        horaInicio: new Date(t0 - 10 * 60_000).toISOString(),
        horaFin: new Date(t0 - 7 * 60_000).toISOString(),
      },
      {
        idOffline: "mid",
        actividadId: ACT,
        tipo: "PAUSA" as const,
        horaInicio: new Date(t0 - 5 * 60_000).toISOString(),
        horaFin: new Date(t0 - 3 * 60_000).toISOString(),
      },
    ];

    await POST(makeReq({ marcajes: items }) as Parameters<typeof POST>[0]);

    // create() should be called in chronological order
    const callOrder = marcajeCreate.mock.calls.map(
      (c) => (c[0] as { data: { idOffline: string } }).data.idOffline
    );
    expect(callOrder).toEqual(["early", "mid", "late"]);
  });

  it("deduplica por idOffline (skip si ya existe en BD)", async () => {
    marcajeFindUnique.mockResolvedValueOnce({ id: "existing-id" });
    const res = await POST(
      makeReq({
        marcajes: [
          {
            idOffline: "dup-1",
            actividadId: ACT,
            tipo: "INICIO",
            horaInicio: new Date().toISOString(),
          },
        ],
      }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.duplicados).toBe(1);
    expect(json.sincronizados).toBe(0);
  });

  it("sincroniza marcajes válidos exitosamente con creadoOffline=true", async () => {
    const res = await POST(
      makeReq({
        marcajes: [
          {
            idOffline: "ok-1",
            actividadId: ACT,
            tipo: "INICIO",
            horaInicio: new Date().toISOString(),
          },
        ],
      }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.sincronizados).toBe(1);
    expect(json.errores).toEqual([]);
    expect(marcajeCreate).toHaveBeenCalledOnce();
    const data = (marcajeCreate.mock.calls[0][0] as { data: { creadoOffline: boolean } }).data;
    expect(data.creadoOffline).toBe(true);
  });

  it("retorna 401 sin sesión", async () => {
    // Override auth mock to return null
    const { auth } = await import("@/lib/auth/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const res = await POST(
      makeReq({
        marcajes: [
          {
            idOffline: "unauth",
            actividadId: ACT,
            tipo: "INICIO",
            horaInicio: new Date().toISOString(),
          },
        ],
      }) as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(401);
  });
});
