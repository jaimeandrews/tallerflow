import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ActividadGrid, type ActividadItem } from "@/components/marcaje/ActividadGrid";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Catálogo sembrado por prisma/seed.ts, en el mismo orden alfabético que
 *  devuelve GET /api/actividades (orderBy: { nombre: "asc" }). */
const CATALOGO_SEED: ActividadItem[] = [
  { id: "a1", nombre: "Almuerzo", color: "#DC2626", icono: "coffee", productiva: false },
  { id: "a2", nombre: "Aseo taller", color: "#6B7280", icono: "trash", productiva: false },
  { id: "a3", nombre: "Diagnóstico", color: "#7C3AED", icono: "search", productiva: true },
  { id: "a4", nombre: "Espera repuesto", color: "#D97706", icono: "clock", productiva: false },
  { id: "a5", nombre: "Garantía", color: "#059669", icono: "shield-check", productiva: true },
  {
    id: "a6",
    nombre: "Mantenimiento preventivo",
    color: "#14B8A6",
    icono: "gauge",
    productiva: true,
  },
  { id: "a7", nombre: "Reparación", color: "#2563EB", icono: "wrench", productiva: true },
  { id: "a8", nombre: "Reunión", color: "#0891B2", icono: "users", productiva: false },
];

/** Actividad creada desde Configuración con un icono que solo ofrece ese
 *  catálogo (ver ICONOS en seccion-actividades.tsx), no el seed. */
const ACTIVIDAD_CONFIGURACION: ActividadItem = {
  id: "a9",
  nombre: "Inspección en terreno",
  color: "#F97316",
  icono: "hard-hat",
  productiva: true,
};

// ─── ActividadGrid ────────────────────────────────────────────────────────────

describe("ActividadGrid", () => {
  it("renderiza TODAS las actividades del catálogo, sin truncar", () => {
    render(<ActividadGrid actividades={CATALOGO_SEED} onSelect={vi.fn()} dark />);

    for (const actividad of CATALOGO_SEED) {
      expect(
        screen.getByRole("button", { name: new RegExp(actividad.nombre, "i") }),
        `"${actividad.nombre}" debe estar visible`
      ).toBeInTheDocument();
    }
  });

  it("separa productivas de no productivas", () => {
    render(<ActividadGrid actividades={CATALOGO_SEED} onSelect={vi.fn()} dark />);

    expect(screen.getByText(/^productivas$/i)).toBeInTheDocument();
    expect(screen.getByText(/^no productivas$/i)).toBeInTheDocument();
  });

  it("muestra actividades creadas desde Configuración", () => {
    render(
      <ActividadGrid
        actividades={[...CATALOGO_SEED, ACTIVIDAD_CONFIGURACION]}
        onSelect={vi.fn()}
        dark
      />
    );

    expect(screen.getByRole("button", { name: /inspección en terreno/i })).toBeInTheDocument();
  });

  /** Los ids de icono que ofrece Configuración (seccion-actividades.tsx) más los
   *  que usa el seed. ActividadGrid debe reconocerlos todos: si cae al icono por
   *  defecto, actividades distintas se ven idénticas en el kiosco. */
  const ICON_IDS = [
    "wrench",
    "hammer",
    "activity",
    "gauge",
    "layers",
    "hard-hat",
    "package",
    "truck",
    "coffee",
    "pause",
    "users",
    "flag",
    "zap",
    "timer",
    "clock",
    "search",
    "shield-check",
    "trash",
  ];

  it("reconoce todos los ids de icono que ofrece Configuración y el seed", () => {
    const actividades: ActividadItem[] = ICON_IDS.map((icono, i) => ({
      id: `ic-${i}`,
      nombre: `Actividad ${icono}`,
      color: "#2563EB",
      icono,
      productiva: true,
    }));

    const { container } = render(
      <ActividadGrid actividades={actividades} onSelect={vi.fn()} dark />
    );

    // Cada icono debe renderizar un <svg> con una clase lucide distinta.
    const clasesLucide = Array.from(container.querySelectorAll("svg")).map((svg) =>
      Array.from(svg.classList)
        .filter((c) => c.startsWith("lucide-"))
        .join(" ")
    );

    expect(clasesLucide).toHaveLength(ICON_IDS.length);
    expect(
      new Set(clasesLucide).size,
      `se esperaban ${ICON_IDS.length} iconos distintos, se obtuvieron ${new Set(clasesLucide).size} — hay ids cayendo al icono por defecto`
    ).toBe(ICON_IDS.length);
  });
});

// ─── Pantalla de kiosco ───────────────────────────────────────────────────────

const mockUser = {
  id: "u1",
  nombre: "Juan",
  apellido: "Pérez",
  iniciales: "JP",
  color: "#2563EB",
  rol: "TECNICO",
  sucursalId: "s1",
};

vi.mock("@/contexts/kiosko-context", () => ({
  useKiosko: () => ({
    user: mockUser,
    token: "tok",
    sucursalId: "s1",
    setAuth: vi.fn(),
    clearAuth: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMarcajeActivo", () => ({
  useMarcajeActivo: () => ({
    marcaje: null,
    loading: false,
    pausar: vi.fn(),
    reanudar: vi.fn(),
    finalizar: vi.fn(),
    iniciar: vi.fn(),
    cambiarActividad: vi.fn(),
  }),
}));

vi.mock("@/hooks/useHistorialHoy", () => ({
  useHistorialHoy: () => ({
    marcajes: [],
    totales: { productivas: 0, noProductivas: 0, total: 0 },
    loading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useInactividadLogout", () => ({
  useInactividadLogout: () => ({ countdown: null }),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: vi.fn((url: string) => {
      if (url.startsWith("/api/actividades")) {
        return Promise.resolve({
          actividades: [...CATALOGO_SEED, ACTIVIDAD_CONFIGURACION],
        });
      }
      if (url.startsWith("/api/ordenes/mis-asignaciones")) {
        return Promise.resolve({ asignaciones: [] });
      }
      return Promise.resolve({});
    }),
    post: vi.fn(),
  },
}));

describe("Pantalla de marcaje kiosco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra todas las actividades básicas sin abrir ningún panel", async () => {
    const { default: MarcajePage } = await import("@/app/(kiosco)/marcaje/page");
    render(<MarcajePage />);

    // Estas son las que el bug ocultaba: quedaban fuera del slice(0, 4) alfabético.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reparación/i })).toBeInTheDocument();
    });

    for (const nombre of [
      "Reparación",
      "Garantía",
      "Diagnóstico",
      "Mantenimiento preventivo",
      "Reunión",
      "Almuerzo",
      "Aseo taller",
      "Espera repuesto",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(nombre, "i") }),
        `"${nombre}" debe verse en el kiosco sin abrir el sheet`
      ).toBeInTheDocument();
    }
  });
});
