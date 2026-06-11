import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

// Mocks
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    usuario: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    sucursal: {
      findUnique: vi.fn(),
    },
    usuarioEspecialidad: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/api-auth", () => ({
  getAuthUser: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  invalidarCacheUsuario: vi.fn(),
}));

vi.mock("@/lib/services/auditoria-service", () => ({
  registrarAuditoria: vi.fn(),
}));

import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { POST as crearUsuarioPOST } from "@/app/api/configuracion/usuarios/route";
import { PUT as editarUsuarioPUT } from "@/app/api/configuracion/usuarios/[id]/route";
import { PATCH as toggleActivoPATCH } from "@/app/api/configuracion/usuarios/[id]/toggle-activo/route";
import { POST as resetPinPOST } from "@/app/api/configuracion/usuarios/[id]/reset-pin/route";

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
  (prisma.usuario.findUnique as any).mockReset();
  (prisma.usuario.findFirst as any).mockReset();
  (prisma.usuario.create as any).mockReset();
  (prisma.usuario.update as any).mockReset();
  (prisma.usuario.count as any).mockReset();
  (prisma.usuario.findMany as any).mockReset();
  (prisma.sucursal.findUnique as any).mockReset();
  (getAuthUser as any).mockReset();
  (registrarAuditoria as any).mockReset();

  (getAuthUser as any).mockResolvedValue({
    id: "admin-id",
    rol: "ADMIN",
    sucursalId: VALID_SUCURSAL_ID,
  });
});

describe("Configuración - Usuarios API", () => {
  describe("Crear Usuario (POST /api/configuracion/usuarios)", () => {
    const validUserBody = {
      email: "test@example.com",
      nombre: "Juan",
      apellido: "Perez",
      rut: "12345678-9",
      rol: "TECNICO",
      sucursalId: VALID_SUCURSAL_ID,
      password: "password123",
      pin: "1234",
    };

    it("Crear usuario con datos válidos → 201, password hasheada", async () => {
      (prisma.usuario.findUnique as any)
        .mockResolvedValueOnce(null) // email
        .mockResolvedValueOnce(null); // rut
      (prisma.sucursal.findUnique as any).mockResolvedValue({
        id: VALID_SUCURSAL_ID,
        activa: true,
      });
      (prisma.usuario.create as any).mockImplementation(({ data }: any) => ({
        id: "new-user-id",
        ...data,
      }));

      const req = makeReq("/api/configuracion/usuarios", validUserBody);
      const res = await crearUsuarioPOST(req);
      expect(res.status).toBe(201);

      const createCall = (prisma.usuario.create as any).mock.calls[0][0];
      const isPasswordHashed = await bcrypt.compare("password123", createCall.data.passwordHash);
      expect(isPasswordHashed).toBe(true);
    });

    it("Crear usuario con email duplicado → 409", async () => {
      (prisma.usuario.findUnique as any)
        .mockResolvedValueOnce({ id: "existing-id" }) // email existe
        .mockResolvedValueOnce(null); // rut

      const req = makeReq("/api/configuracion/usuarios", validUserBody);
      const res = await crearUsuarioPOST(req);
      expect(res.status).toBe(409); // API returns 409 for duplicate email
    });

    it("Crear usuario con RUT duplicado → 409", async () => {
      (prisma.usuario.findUnique as any)
        .mockResolvedValueOnce(null) // email
        .mockResolvedValueOnce({ id: "existing-id" }); // rut existe

      const req = makeReq("/api/configuracion/usuarios", validUserBody);
      const res = await crearUsuarioPOST(req);
      expect(res.status).toBe(409); // API returns 409 for duplicate rut
    });

    it("Crear técnico con PIN → PIN hasheado en BD (no texto plano)", async () => {
      (prisma.usuario.findUnique as any).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      (prisma.sucursal.findUnique as any).mockResolvedValue({
        id: VALID_SUCURSAL_ID,
        activa: true,
      });
      (prisma.usuario.create as any).mockImplementation(({ data }: any) => ({
        id: "new-user-id",
        ...data,
      }));

      const req = makeReq("/api/configuracion/usuarios", validUserBody);
      const res = await crearUsuarioPOST(req);
      expect(res.status).toBe(201);

      const createCall = (prisma.usuario.create as any).mock.calls[0][0];
      expect(createCall.data.pin).not.toBe("1234");
      const isPinHashed = await bcrypt.compare("1234", createCall.data.pin);
      expect(isPinHashed).toBe(true);
    });

    it("JEFE_TALLER crea TECNICO en su sucursal → OK", async () => {
      (getAuthUser as any).mockResolvedValue({
        id: "jefe-id",
        rol: "JEFE_TALLER",
        sucursalId: VALID_SUCURSAL_ID,
      });
      (prisma.usuario.findUnique as any).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      (prisma.sucursal.findUnique as any).mockResolvedValue({
        id: VALID_SUCURSAL_ID,
        activa: true,
      });
      (prisma.usuario.create as any).mockImplementation(({ data }: any) => ({
        id: "new-user-id",
        ...data,
      }));

      const req = makeReq("/api/configuracion/usuarios", validUserBody);
      const res = await crearUsuarioPOST(req);
      expect(res.status).toBe(201);
    });

    it("JEFE_TALLER intenta crear ADMIN → 403", async () => {
      (getAuthUser as any).mockResolvedValue({
        id: "jefe-id",
        rol: "JEFE_TALLER",
        sucursalId: VALID_SUCURSAL_ID,
      });

      const body = { ...validUserBody, rol: "ADMIN" };
      const req = makeReq("/api/configuracion/usuarios", body);
      const res = await crearUsuarioPOST(req);
      expect(res.status).toBe(403);
    });

    it("JEFE_TALLER intenta crear usuario en otra sucursal → 403", async () => {
      (getAuthUser as any).mockResolvedValue({
        id: "jefe-id",
        rol: "JEFE_TALLER",
        sucursalId: VALID_SUCURSAL_ID,
      });

      const body = { ...validUserBody, sucursalId: "550e8400-e29b-41d4-a716-446655440001" };
      const req = makeReq("/api/configuracion/usuarios", body);
      const res = await crearUsuarioPOST(req);
      expect(res.status).toBe(403);
    });
  });

  describe("Editar Usuario (PUT /api/configuracion/usuarios/[id])", () => {
    it("Editar usuario: cambiar nombre → OK, password no cambia", async () => {
      (prisma.usuario.findUnique as any)
        .mockResolvedValueOnce({ id: "user-1", sucursalId: VALID_SUCURSAL_ID, rol: "TECNICO" }) // verificarAcceso
        .mockResolvedValueOnce({ id: "user-1", email: "test@example.com" }); // usuarioAnterior

      (prisma.usuario.update as any).mockResolvedValue({ id: "user-1" });

      const body = { nombre: "NuevoNombre" };
      const req = makeReq("/api/configuracion/usuarios/user-1", body, "PUT");
      const res = await editarUsuarioPUT(req, { params: Promise.resolve({ id: "user-1" }) });

      expect(res.status).toBe(200);
      const updateCall = (prisma.usuario.update as any).mock.calls[0][0];
      expect(updateCall.data.nombre).toBe("NuevoNombre");
      expect(updateCall.data.passwordHash).toBeUndefined();
    });

    it("Editar usuario: cambiar password → nueva password hasheada", async () => {
      (prisma.usuario.findUnique as any)
        .mockResolvedValueOnce({ id: "user-1", sucursalId: VALID_SUCURSAL_ID, rol: "TECNICO" })
        .mockResolvedValueOnce({ id: "user-1", email: "test@example.com" });

      (prisma.usuario.update as any).mockResolvedValue({ id: "user-1" });

      const body = { password: "newpassword123" };
      const req = makeReq("/api/configuracion/usuarios/user-1", body, "PUT");
      const res = await editarUsuarioPUT(req, { params: Promise.resolve({ id: "user-1" }) });

      expect(res.status).toBe(200);
      const updateCall = (prisma.usuario.update as any).mock.calls[0][0];
      expect(updateCall.data.passwordHash).not.toBe("newpassword123");
      const isPasswordHashed = await bcrypt.compare("newpassword123", updateCall.data.passwordHash);
      expect(isPasswordHashed).toBe(true);
    });
  });

  describe("Toggle Activo (PATCH /api/configuracion/usuarios/[id]/toggle-activo)", () => {
    it("Toggle activo: desactivar usuario → activo=false", async () => {
      (prisma.usuario.findUnique as any).mockResolvedValue({
        id: "user-1",
        sucursalId: VALID_SUCURSAL_ID,
        activo: true,
        nombre: "Juan",
        apellido: "Perez",
        rol: "TECNICO",
      });

      const req = makeReq("/api/configuracion/usuarios/user-1/toggle-activo", null, "PATCH");
      const res = await toggleActivoPATCH(req, { params: Promise.resolve({ id: "user-1" }) });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ activo: false });
      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "user-1" },
          data: { activo: false },
        })
      );
    });

    it("Toggle activo: no permite desactivarse a sí mismo", async () => {
      (getAuthUser as any).mockResolvedValue({
        id: "admin-id",
        rol: "ADMIN",
        sucursalId: VALID_SUCURSAL_ID,
      });

      const req = makeReq("/api/configuracion/usuarios/admin-id/toggle-activo", null, "PATCH");
      const res = await toggleActivoPATCH(req, { params: Promise.resolve({ id: "admin-id" }) });

      expect(res.status).toBe(403);
    });
  });

  describe("Reset PIN (POST /api/configuracion/usuarios/[id]/reset-pin)", () => {
    it("Reset PIN: nuevo PIN hasheado, anterior no funciona y no aparece en LogAuditoria", async () => {
      (prisma.usuario.findUnique as any).mockResolvedValue({
        id: "user-1",
        sucursalId: VALID_SUCURSAL_ID,
        nombre: "Juan",
        apellido: "Perez",
      });

      const body = { nuevoPin: "9999" };
      const req = makeReq("/api/configuracion/usuarios/user-1/reset-pin", body, "POST");
      const res = await resetPinPOST(req, { params: Promise.resolve({ id: "user-1" }) });

      expect(res.status).toBe(200);

      // Verificar que se actualizó el PIN en la BD de forma hasheada
      const updateCall = (prisma.usuario.update as any).mock.calls[0][0];
      expect(updateCall.data.pin).not.toBe("9999");
      const isPinHashed = await bcrypt.compare("9999", updateCall.data.pin);
      expect(isPinHashed).toBe(true);

      // Verificar auditoría
      expect(registrarAuditoria).toHaveBeenCalledWith(
        expect.objectContaining({
          accion: "RESET_PIN",
          datosNuevos: { pinReseteado: true }, // No debe contener el PIN real ni el hash
        })
      );

      // Asegurarse de que ni el hash ni la clave en texto plano aparezcan en ningún campo de auditoría
      const auditoriaCallArgs = (registrarAuditoria as any).mock.calls[0][0];
      const stringifiedArgs = JSON.stringify(auditoriaCallArgs);
      expect(stringifiedArgs).not.toContain("9999");
      expect(stringifiedArgs).not.toContain(updateCall.data.pin);
    });
  });
});
