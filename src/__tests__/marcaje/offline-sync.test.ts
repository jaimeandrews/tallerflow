import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock sonner (toast)
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock offline-store
vi.mock("@/lib/offline/offline-store", () => ({
  getPendingMarcajes: vi.fn(),
  removePendingMarcaje: vi.fn(),
  setLastSync: vi.fn(),
}));

import { syncPending, onSyncStateChange } from "@/lib/offline/offline-sync";
import { getPendingMarcajes, removePendingMarcaje, setLastSync } from "@/lib/offline/offline-store";
import { toast } from "sonner";

const getPendingMock = getPendingMarcajes as ReturnType<typeof vi.fn>;
const removeMock = removePendingMarcaje as ReturnType<typeof vi.fn>;
const setLastSyncMock = setLastSync as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getPendingMock.mockReset();
  removeMock.mockReset();
  setLastSyncMock.mockReset();
  vi.restoreAllMocks();
  // Reset global fetch
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("syncPending", () => {
  it("retorna null cuando no hay marcajes pendientes", async () => {
    getPendingMock.mockResolvedValue([]);
    const result = await syncPending({ silent: true });
    expect(result).toBeNull();
  });

  it("envía marcajes al endpoint y retorna resultado exitoso", async () => {
    const pending = [
      {
        idOffline: "off-1",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        dispositivo: "kiosco",
        createdAt: Date.now(),
      },
    ];
    getPendingMock.mockResolvedValue(pending);

    const syncResult = { sincronizados: 1, duplicados: 0, errores: [] };
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => syncResult,
    });

    const result = await syncPending({ silent: true });
    expect(result).toEqual(syncResult);
    expect(removeMock).toHaveBeenCalledWith("off-1");
    expect(setLastSyncMock).toHaveBeenCalledWith("marcajes");
  });

  it("muestra toast de éxito cuando silent=false y hay sincronizados", async () => {
    const pending = [
      {
        idOffline: "off-1",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
    ];
    getPendingMock.mockResolvedValue(pending);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sincronizados: 1, duplicados: 0, errores: [] }),
    });

    await syncPending({ silent: false });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("1 marcaje sincronizado"));
  });

  it("muestra toast de warning cuando hay errores y silent=false", async () => {
    const pending = [
      {
        idOffline: "off-err",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
    ];
    getPendingMock.mockResolvedValue(pending);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        sincronizados: 0,
        duplicados: 0,
        errores: ["off-err: solapamiento con marcaje existente"],
      }),
    });

    await syncPending({ silent: false });
    expect(toast.warning).toHaveBeenCalled();
  });

  it("NO elimina marcajes cuyo idOffline aparece en errores", async () => {
    const okId = "a0b1c2d3-e4f5-0000-0000-000000000001";
    const errId = "f9e8d7c6-b5a4-0000-0000-000000000002";
    const pending = [
      {
        idOffline: okId,
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
      {
        idOffline: errId,
        actividadId: "act-1",
        tipo: "FIN",
        horaInicio: "2026-05-13T09:00:00Z",
        createdAt: Date.now(),
      },
    ];
    getPendingMock.mockResolvedValue(pending);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        sincronizados: 1,
        duplicados: 0,
        errores: [`${errId}: solapamiento con marcaje existente`],
      }),
    });

    await syncPending({ silent: true });

    // "okId" should be removed (success), "errId" should stay (error)
    expect(removeMock).toHaveBeenCalledWith(okId);
    expect(removeMock).not.toHaveBeenCalledWith(errId);
  });

  it("incluye Authorization header cuando se provee token", async () => {
    getPendingMock.mockResolvedValue([
      {
        idOffline: "off-t",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
    ]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sincronizados: 1, duplicados: 0, errores: [] }),
    });

    await syncPending({ token: "my-bearer-token", silent: true });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = fetchCall[1].headers;
    expect(headers["Authorization"]).toBe("Bearer my-bearer-token");
  });

  it("retorna null y muestra toast.error cuando fetch falla", async () => {
    getPendingMock.mockResolvedValue([
      {
        idOffline: "off-fail",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
    ]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await syncPending({ silent: false });
    expect(result).toBeNull();
    expect(toast.error).toHaveBeenCalled();
  });

  it("retorna null si hay un error de red (fetch throws)", async () => {
    getPendingMock.mockResolvedValue([
      {
        idOffline: "off-net",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
    ]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Network error"));

    const result = await syncPending({ silent: true });
    expect(result).toBeNull();
  });
});

describe("onSyncStateChange", () => {
  it("notifica 'syncing' al iniciar y 'success' al finalizar", async () => {
    const states: string[] = [];
    const unsub = onSyncStateChange((s) => states.push(s));

    getPendingMock.mockResolvedValue([
      {
        idOffline: "off-state",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
    ]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sincronizados: 1, duplicados: 0, errores: [] }),
    });

    await syncPending({ silent: true });

    expect(states).toContain("syncing");
    expect(states).toContain("success");

    unsub();
  });

  it("unsubscribe deja de notificar", async () => {
    const states: string[] = [];
    const unsub = onSyncStateChange((s) => states.push(s));
    unsub();

    getPendingMock.mockResolvedValue([
      {
        idOffline: "off-unsub",
        actividadId: "act-1",
        tipo: "INICIO",
        horaInicio: "2026-05-13T08:00:00Z",
        createdAt: Date.now(),
      },
    ]);
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sincronizados: 1, duplicados: 0, errores: [] }),
    });

    await syncPending({ silent: true });
    expect(states).toHaveLength(0);
  });
});
