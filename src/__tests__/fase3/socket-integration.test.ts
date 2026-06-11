import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks
const emitMock = vi.fn();
const toMock = vi.fn().mockReturnValue({ emit: emitMock });
const useMock = vi.fn();
const onMock = vi.fn();

const namespaceMock = {
  to: toMock,
  emit: emitMock,
  use: useMock,
  on: onMock,
};

vi.mock("socket.io", () => ({
  Server: vi.fn().mockImplementation(function () {
    return {
      of: vi.fn().mockReturnValue(namespaceMock),
    };
  }),
}));

vi.mock("@auth/core/jwt", () => ({
  decode: vi.fn(),
}));

import { Server } from "socket.io";
import { initSocketServer, getSocketIO } from "@/lib/socket/socket-server";
import { socketEmit } from "@/lib/socket/socket-emitter";
import { decode } from "@auth/core/jwt";

describe("socket-integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clear global variable
    delete (globalThis as any).__tallerflowSocketIO;
    process.env.AUTH_SECRET = "test";
  });

  describe("socket-emitter", () => {
    it("Al crear marcaje, se emite 'marcaje:nuevo' a la sucursal correcta", () => {
      initSocketServer({} as any);

      const payload = {
        marcaje: { id: "m-1" } as any,
        tecnico: { id: "t-1", nombre: "A", iniciales: "A", color: "red" },
      };

      socketEmit.marcajeNuevo("suc-1", payload);

      expect(toMock).toHaveBeenCalledWith("sucursal:suc-1");
      expect(emitMock).toHaveBeenCalledWith("marcaje:nuevo", payload);
    });

    it("Al pausar, se emite 'tecnico:estadoCambio' con estado PAUSA", () => {
      initSocketServer({} as any);

      const payload = {
        tecnicoId: "t-1",
        estadoAnterior: "TRABAJANDO" as const,
        estadoNuevo: "PAUSA" as const,
      };

      socketEmit.tecnicoEstadoCambio("suc-1", payload);

      expect(toMock).toHaveBeenCalledWith("sucursal:suc-1");
      expect(emitMock).toHaveBeenCalledWith("tecnico:estadoCambio", payload);
    });

    it("Al resolver alerta, se emite 'alerta:resuelta' con el ID correcto", () => {
      initSocketServer({} as any);

      const payload = {
        alertaId: "alerta-1",
        resueltaPor: { id: "u-1", nombre: "Admin" },
      };

      socketEmit.alertaResuelta("suc-1", payload);

      expect(toMock).toHaveBeenCalledWith("sucursal:suc-1");
      expect(emitMock).toHaveBeenCalledWith("alerta:resuelta", payload);
    });
  });

  describe("socket-server connections", () => {
    let mockNext: any;
    let authMiddleware: any;
    let connectionHandler: any;

    beforeEach(() => {
      mockNext = vi.fn();
      initSocketServer({} as any);

      // Get the middleware registered via use()
      authMiddleware = useMock.mock.calls[0][0];
      connectionHandler = onMock.mock.calls.find((call) => call[0] === "connection")[1];
    });

    it("Cliente sin JWT válido no puede conectarse", async () => {
      const mockSocket = {
        handshake: {
          auth: {},
          headers: { cookie: "" },
        },
      };

      await authMiddleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toMatch(/missing token/i);
    });

    it("Cliente con JWT inválido no puede conectarse", async () => {
      (decode as any).mockResolvedValue(null);

      const mockSocket = {
        handshake: {
          auth: { token: "invalid-token" },
          headers: {},
        },
      };

      await authMiddleware(mockSocket, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toMatch(/invalid token/i);
    });

    it("Cliente se une a room de su sucursal al conectar", async () => {
      // simulate successful middleware
      (decode as any).mockResolvedValue({
        id: "u-1",
        sucursalId: "suc-1",
        nombre: "Test",
      });

      const mockSocket = {
        handshake: {
          auth: { token: "valid-token" },
          headers: {},
        },
        data: {
          id: "u-1",
          sucursalId: "suc-1",
        },
        join: vi.fn(),
        on: vi.fn(),
      };

      // Ensure data is attached
      await authMiddleware(mockSocket, mockNext);
      expect(mockNext).toHaveBeenCalledWith(); // no error

      // Call connection handler
      connectionHandler(mockSocket);

      expect(mockSocket.join).toHaveBeenCalledWith("sucursal:suc-1");
    });
  });
});
