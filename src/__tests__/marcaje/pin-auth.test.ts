import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock prisma BEFORE importing the route
vi.mock("@/lib/db/prisma", () => {
  return {
    prisma: {
      sucursal: { findFirst: vi.fn() },
      usuario: { findMany: vi.fn() },
      logAuditoria: { create: vi.fn().mockResolvedValue({ id: "log-1" }) },
    },
  };
});

// Mock NextAuth's auth() (used indirectly via api-auth)
vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

// Mock @auth/core/jwt to avoid jose v6 Uint8Array errors in jsdom
vi.mock("@auth/core/jwt", () => ({
  encode: vi.fn().mockImplementation(async ({ token }: { token: Record<string, unknown> }) => {
    return `mock-jwt.${Buffer.from(JSON.stringify(token)).toString("base64url")}.sig`;
  }),
  decode: vi.fn().mockImplementation(async ({ token }: { token: string }) => {
    const parts = token.split(".");
    if (parts.length >= 2) {
      return JSON.parse(Buffer.from(parts[1], "base64url").toString());
    }
    return null;
  }),
}));

// Set env for token signing
process.env.AUTH_SECRET = "test-secret-for-vitest-only-do-not-use-prod";

import { POST } from "@/app/api/auth/pin/route";
import { prisma } from "@/lib/db/prisma";
import { __resetRateLimit } from "@/lib/middleware/rate-limit";

const SUCURSAL_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_SUCURSAL_ID = "550e8400-e29b-41d4-a716-446655440001";

const findFirstMock = prisma.sucursal.findFirst as ReturnType<typeof vi.fn>;
const findManyMock = prisma.usuario.findMany as ReturnType<typeof vi.fn>;

function makeRequest(body: object, ip = "1.2.3.4") {
  return new Request("http://localhost/api/auth/pin", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

async function makeUser(pin: string, sucursalId = SUCURSAL_ID) {
  return {
    id: "user-1",
    email: "tecnico@tallerflow.cl",
    nombre: "Carlos",
    apellido: "Mendoza",
    iniciales: "CM",
    rol: "TECNICO" as const,
    sucursalId,
    color: "#0891B2",
    pin: await bcrypt.hash(pin, 4), // low rounds for test speed
  };
}

beforeEach(() => {
  __resetRateLimit();
  findFirstMock.mockReset();
  findManyMock.mockReset();
  findFirstMock.mockResolvedValue({ id: SUCURSAL_ID });
});

describe("/api/auth/pin", () => {
  it("retorna token y user con PIN correcto", async () => {
    findManyMock.mockResolvedValue([await makeUser("1234")]);

    const res = await POST(
      makeRequest({ pin: "1234", sucursalId: SUCURSAL_ID }) as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.token).toBeTypeOf("string");
    expect(json.token.length).toBeGreaterThan(20);
    expect(json.user).toMatchObject({
      id: "user-1",
      nombre: "Carlos",
      iniciales: "CM",
      rol: "TECNICO",
      sucursalId: SUCURSAL_ID,
    });
  });

  it("la respuesta NO incluye pin ni passwordHash en el body", async () => {
    findManyMock.mockResolvedValue([await makeUser("1234")]);
    const res = await POST(
      makeRequest({ pin: "1234", sucursalId: SUCURSAL_ID }) as Parameters<typeof POST>[0]
    );
    const json = await res.json();
    expect(json.user.pin).toBeUndefined();
    expect(json.user.passwordHash).toBeUndefined();
    expect(json.pin).toBeUndefined();
  });

  it("retorna error genérico con PIN incorrecto (no revela si el usuario existe)", async () => {
    findManyMock.mockResolvedValue([await makeUser("9999")]);
    const res = await POST(
      makeRequest({ pin: "1234", sucursalId: SUCURSAL_ID }) as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("PIN inválido");
  });

  it("bloquea (status 429) tras 5 intentos fallidos consecutivos desde la misma IP", async () => {
    findManyMock.mockResolvedValue([await makeUser("9999")]);

    for (let i = 0; i < 5; i++) {
      const res = await POST(
        makeRequest({ pin: "1234", sucursalId: SUCURSAL_ID }) as Parameters<typeof POST>[0]
      );
      // First 4 are 401, the 5th triggers the block → 429
      if (i < 4) expect(res.status).toBe(401);
      else expect(res.status).toBe(429);
    }
  });

  it("rechaza sucursal inválida (no existe o inactiva)", async () => {
    findFirstMock.mockResolvedValueOnce(null);
    findManyMock.mockResolvedValue([await makeUser("1234")]);

    const res = await POST(
      makeRequest({ pin: "1234", sucursalId: SUCURSAL_ID }) as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/sucursal/i);
  });

  it("PIN correcto de OTRA sucursal no autentica (findMany scoped por sucursal)", async () => {
    // findMany for sucursalId=SUCURSAL_ID returns no users (the user belongs to OTHER_SUCURSAL_ID)
    findManyMock.mockResolvedValue([]);

    const res = await POST(
      makeRequest({ pin: "1234", sucursalId: SUCURSAL_ID }) as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(401);
    // Verify the findMany was scoped to the request's sucursal
    const callArgs = findManyMock.mock.calls[0][0];
    expect(callArgs.where.sucursalId).toBe(SUCURSAL_ID);
    expect(callArgs.where.sucursalId).not.toBe(OTHER_SUCURSAL_ID);
  });

  it("rechaza PIN con formato inválido (no son 4 dígitos)", async () => {
    const res = await POST(
      makeRequest({ pin: "abcd", sucursalId: SUCURSAL_ID }) as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(400);
  });

  it("rechaza sucursalId no UUID", async () => {
    const res = await POST(
      makeRequest({ pin: "1234", sucursalId: "not-a-uuid" }) as Parameters<typeof POST>[0]
    );
    expect(res.status).toBe(400);
  });
});
