import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { toast } from "sonner";

// Mocks for useReportes
vi.mock("@/hooks/useResumenPeriodo", () => ({
  useResumenPeriodo: vi.fn(() => ({
    data: { totalHH: 100, tecnicoMasProductivo: { nombre: "Juan", hh: 50 } },
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/useTecnicosReporte", () => ({
  useTecnicosReporte: vi.fn(() => ({
    data: [{ tecnicoId: "tec-1", nombre: "Juan", productividad: 85 }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/useOrdenesReporte", () => ({
  useOrdenesReporte: vi.fn(() => ({
    data: [{ ofId: "of-1", numero: "OF-1", hhConsumidas: 10 }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/useSucursalesReporte", () => ({
  useSucursalesReporte: vi.fn(() => ({
    data: [{ sucursalId: "suc-1", nombre: "Santiago", productividad: 75 }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/hooks/useHHDiarias", () => ({
  useHHDiarias: vi.fn(() => ({
    data: [{ fecha: "2026-05-19", hh: 8 }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock("@/lib/utils/use-debounce", () => ({
  useDebounce: vi.fn((val) => val),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { useConfiguracion } from "@/hooks/useConfiguracion";
import { useReportes } from "@/hooks/useReportes";
import { useResumenPeriodo } from "@/hooks/useResumenPeriodo";
import { useTecnicosReporte } from "@/hooks/useTecnicosReporte";
import { useOrdenesReporte } from "@/hooks/useOrdenesReporte";
import { useSucursalesReporte } from "@/hooks/useSucursalesReporte";
import { useHHDiarias } from "@/hooks/useHHDiarias";
import { useDebounce } from "@/lib/utils/use-debounce";

describe("Hooks de React", () => {
  describe("useConfiguracion", () => {
    const mockEndpoint = "/api/configuracion/turnos";
    const mockData = [
      { id: "1", nombre: "Turno A", activo: true },
      { id: "2", nombre: "Turno B", activo: false },
    ];

    beforeEach(() => {
      vi.clearAllMocks();
      global.fetch = vi.fn();
    });

    it("debe cargar datos al montar el hook", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockData, total: 2 }),
      });

      const { result } = renderHook(() => useConfiguracion({ endpoint: mockEndpoint }));

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.total).toBe(2);
      expect(result.current.error).toBeNull();
      expect(global.fetch).toHaveBeenCalledWith(mockEndpoint);
    });

    it("debe adjuntar queryParams en la llamada GET", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: mockData, total: 2 }),
      });

      const queryParams = { sucursalId: "550e8400-e29b-41d4-a716-446655440000", limit: 10 };

      renderHook(() =>
        useConfiguracion({
          endpoint: mockEndpoint,
          queryParams,
        })
      );

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          `${mockEndpoint}?sucursalId=550e8400-e29b-41d4-a716-446655440000&limit=10`
        );
      });
    });

    it("debe manejar errores en la carga de datos", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: "Error de servidor" }),
      });

      const { result } = renderHook(() => useConfiguracion({ endpoint: mockEndpoint }));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe("Error de servidor");
      expect(result.current.data).toEqual([]);
    });

    it("create: POST exitoso actualiza estado e invoca toast.success", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockData, total: 2 }),
        }) // initial fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ turno: { id: "3", nombre: "Turno C" } }),
        }) // post call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [...mockData, { id: "3", nombre: "Turno C" }], total: 3 }),
        }); // refetch

      const { result } = renderHook(() =>
        useConfiguracion({
          endpoint: mockEndpoint,
          messages: { createSuccess: "Creado con éxito" },
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      let res;
      await act(async () => {
        res = await result.current.create({ nombre: "Turno C" });
      });

      expect(res).toEqual({
        ok: true,
        data: { id: "3", nombre: "Turno C" },
        warnings: [],
      });
      expect(toast.success).toHaveBeenCalledWith("Creado con éxito");
      expect(global.fetch).toHaveBeenCalledWith(
        mockEndpoint,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ nombre: "Turno C" }),
        })
      );
    });

    it("update: PUT exitoso actualiza datos en el backend", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockData, total: 2 }),
        }) // initial fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ turno: { id: "1", nombre: "Turno A Modificado" } }),
        }) // put call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: "1", nombre: "Turno A Modificado" }, mockData[1]],
            total: 2,
          }),
        }); // refetch

      const { result } = renderHook(() =>
        useConfiguracion({
          endpoint: mockEndpoint,
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      let res;
      await act(async () => {
        res = await result.current.update("1", { nombre: "Turno A Modificado" });
      });

      expect(res.ok).toBe(true);
      expect(toast.success).toHaveBeenCalledWith("Actualizado correctamente");
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/1`,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ nombre: "Turno A Modificado" }),
        })
      );
    });

    it("toggleActive: PATCH cambia estado activo/inactivo", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockData, total: 2 }),
        }) // initial fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "1", activa: false }),
        }) // patch call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: "1", nombre: "Turno A", activo: false }, mockData[1]],
            total: 2,
          }),
        }); // refetch

      const { result } = renderHook(() =>
        useConfiguracion({
          endpoint: mockEndpoint,
          toggleSuffix: "toggle-activa",
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      let res;
      await act(async () => {
        res = await result.current.toggleActive("1");
      });

      expect(res.ok).toBe(true);
      expect(toast.success).toHaveBeenCalledWith("Desactivado");
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/1/toggle-activa`,
        expect.objectContaining({
          method: "PATCH",
        })
      );
    });

    it("remove: DELETE elimina el registro", async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: mockData, total: 2 }),
        }) // initial fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        }) // delete call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [mockData[1]], total: 1 }),
        }); // refetch

      const { result } = renderHook(() =>
        useConfiguracion({
          endpoint: mockEndpoint,
        })
      );

      await waitFor(() => expect(result.current.loading).toBe(false));

      let res;
      await act(async () => {
        res = await result.current.remove("1");
      });

      expect(res.ok).toBe(true);
      expect(toast.success).toHaveBeenCalledWith("Eliminado correctamente");
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/1`,
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("useReportes", () => {
    const mockSucursalId = "550e8400-e29b-41d4-a716-446655440000";

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("debe inicializarse con filtros predeterminados y datos de sub-hooks", () => {
      const { result } = renderHook(() =>
        useReportes({
          sucursalIdDefault: mockSucursalId,
          rol: "ADMIN",
        })
      );

      expect(result.current.filtros.periodo).toBe("mes");
      expect(result.current.filtros.sucursalId).toBe(mockSucursalId);
      expect(result.current.filtros.tipo).toBe("tecnicos");

      expect(result.current.tecnicos.data).toHaveLength(1);
      expect(result.current.tecnicos.data[0].tecnicoId).toBe("tec-1");
      expect(result.current.resumen.data?.totalHH).toBe(100);
    });

    it("setFiltros actualiza los filtros y desencadena cambios", async () => {
      const { result } = renderHook(() =>
        useReportes({
          sucursalIdDefault: mockSucursalId,
          rol: "ADMIN",
        })
      );

      act(() => {
        result.current.setFiltros({ tipo: "ordenes" });
      });

      expect(result.current.filtros.tipo).toBe("ordenes");
    });

    it("refetchAll invoca refetch en todos los sub-hooks", () => {
      const mockResumenRefetch = vi.fn();
      const mockTecnicosRefetch = vi.fn();
      const mockOrdenesRefetch = vi.fn();
      const mockSucursalesRefetch = vi.fn();
      const mockHHDiariasRefetch = vi.fn();

      (useResumenPeriodo as any).mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: mockResumenRefetch,
      });
      (useTecnicosReporte as any).mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: mockTecnicosRefetch,
      });
      (useOrdenesReporte as any).mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: mockOrdenesRefetch,
      });
      (useSucursalesReporte as any).mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: mockSucursalesRefetch,
      });
      (useHHDiarias as any).mockReturnValue({
        data: [],
        loading: false,
        error: null,
        refetch: mockHHDiariasRefetch,
      });

      const { result } = renderHook(() =>
        useReportes({
          sucursalIdDefault: mockSucursalId,
          rol: "ADMIN",
        })
      );

      act(() => {
        result.current.refetchAll();
      });

      expect(mockResumenRefetch).toHaveBeenCalled();
      expect(mockTecnicosRefetch).toHaveBeenCalled();
      expect(mockOrdenesRefetch).toHaveBeenCalled();
      expect(mockSucursalesRefetch).toHaveBeenCalled();
      expect(mockHHDiariasRefetch).toHaveBeenCalled();
    });

    it("exportar: invoca toast.info y gatilla click de descarga", () => {
      const mockElement = document.createElement("a");
      const clickSpy = vi.spyOn(mockElement, "click").mockImplementation(() => {});
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName) => {
        if (tagName === "a") return mockElement;
        return originalCreateElement(tagName);
      });

      const { result } = renderHook(() =>
        useReportes({
          sucursalIdDefault: mockSucursalId,
          rol: "ADMIN",
        })
      );

      act(() => {
        result.current.exportar("pdf");
      });

      expect(toast.info).toHaveBeenCalledWith("Generando PDF…");
      expect(mockElement.href).toContain("/api/reportes/exportar?");
      expect(mockElement.href).toContain("formato=pdf");
      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
