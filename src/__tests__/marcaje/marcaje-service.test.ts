import { describe, it, expect } from "vitest";
import {
  calcularDuracionMinutos,
  calcularHHConsumidas,
  verificarSolapamiento,
  obtenerEstadoTecnico,
} from "@/lib/services/marcaje-service";
import type { Marcaje, Actividad } from "@/generated/prisma";

function makeActividad(over: Partial<Actividad> = {}): Actividad {
  return {
    id: "act-1",
    nombre: "Reparación",
    icono: "wrench",
    color: "#2563EB",
    productiva: true,
    activa: true,
    sucursalId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function makeMarcaje(over: Partial<Marcaje> = {}): Marcaje {
  return {
    id: "m-1",
    usuarioId: "u-1",
    ordenTrabajoId: null,
    actividadId: "act-1",
    tipo: "INICIO",
    horaInicio: new Date("2026-05-13T08:00:00Z"),
    horaFin: null,
    duracionMinutos: null,
    sucursalId: "s-1",
    turnoId: null,
    dispositivo: null,
    sincronizado: true,
    creadoOffline: false,
    idOffline: null,
    notas: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("calcularDuracionMinutos", () => {
  it("retorna 60 minutos para 1 hora exacta", () => {
    const a = new Date("2026-05-13T08:00:00Z");
    const b = new Date("2026-05-13T09:00:00Z");
    expect(calcularDuracionMinutos(a, b)).toBe(60);
  });

  it("retorna 0 cuando ambas fechas son iguales", () => {
    const a = new Date("2026-05-13T08:00:00Z");
    expect(calcularDuracionMinutos(a, a)).toBe(0);
  });

  it("maneja correctamente el cruce de medianoche", () => {
    const a = new Date("2026-05-13T23:30:00Z");
    const b = new Date("2026-05-14T00:30:00Z");
    expect(calcularDuracionMinutos(a, b)).toBe(60);
  });

  it("retorna fracciones de minuto", () => {
    const a = new Date("2026-05-13T08:00:00Z");
    const b = new Date("2026-05-13T08:00:30Z");
    expect(calcularDuracionMinutos(a, b)).toBe(0.5);
  });
});

describe("calcularHHConsumidas", () => {
  it("suma solo marcajes cerrados (con duracionMinutos)", () => {
    const marcajes = [
      makeMarcaje({
        duracionMinutos: 60,
        actividad: makeActividad({ productiva: true }),
      } as Marcaje & { actividad: Actividad }),
      makeMarcaje({
        duracionMinutos: null, // open marcaje — ignored
        actividad: makeActividad({ productiva: true }),
      } as Marcaje & { actividad: Actividad }),
    ] as (Marcaje & { actividad: Actividad })[];

    const r = calcularHHConsumidas(marcajes);
    expect(r.productivas).toBe(1);
    expect(r.noProductivas).toBe(0);
    expect(r.total).toBe(1);
  });

  it("separa productivas de no productivas", () => {
    const marcajes = [
      { ...makeMarcaje({ duracionMinutos: 120 }), actividad: makeActividad({ productiva: true }) },
      {
        ...makeMarcaje({ duracionMinutos: 60 }),
        actividad: makeActividad({ productiva: false, nombre: "Almuerzo" }),
      },
      {
        ...makeMarcaje({ duracionMinutos: 30 }),
        actividad: makeActividad({ productiva: false, nombre: "Aseo taller" }),
      },
    ] as (Marcaje & { actividad: Actividad })[];

    const r = calcularHHConsumidas(marcajes);
    expect(r.productivas).toBe(2);
    expect(r.noProductivas).toBe(1.5);
    expect(r.total).toBe(3.5);
  });

  it("retorna ceros para arreglo vacío", () => {
    const r = calcularHHConsumidas([]);
    expect(r).toEqual({ productivas: 0, noProductivas: 0, total: 0 });
  });
});

describe("verificarSolapamiento", () => {
  it("detecta sin solapamiento cuando los rangos no se cruzan", () => {
    const existentes = [
      makeMarcaje({
        horaInicio: new Date("2026-05-13T08:00:00Z"),
        horaFin: new Date("2026-05-13T09:00:00Z"),
      }),
    ];
    const nuevo = {
      horaInicio: new Date("2026-05-13T09:30:00Z"),
      horaFin: new Date("2026-05-13T10:00:00Z"),
    };
    expect(verificarSolapamiento(existentes, nuevo)).toBe(false);
  });

  it("detecta solapamiento parcial al inicio", () => {
    const existentes = [
      makeMarcaje({
        horaInicio: new Date("2026-05-13T08:00:00Z"),
        horaFin: new Date("2026-05-13T09:00:00Z"),
      }),
    ];
    const nuevo = {
      horaInicio: new Date("2026-05-13T08:30:00Z"),
      horaFin: new Date("2026-05-13T09:30:00Z"),
    };
    expect(verificarSolapamiento(existentes, nuevo)).toBe(true);
  });

  it("detecta cuando un rango contiene al otro", () => {
    const existentes = [
      makeMarcaje({
        horaInicio: new Date("2026-05-13T08:00:00Z"),
        horaFin: new Date("2026-05-13T10:00:00Z"),
      }),
    ];
    const nuevo = {
      horaInicio: new Date("2026-05-13T08:30:00Z"),
      horaFin: new Date("2026-05-13T09:00:00Z"),
    };
    expect(verificarSolapamiento(existentes, nuevo)).toBe(true);
  });

  it("retorna false con arreglo de existentes vacío", () => {
    const nuevo = {
      horaInicio: new Date("2026-05-13T08:00:00Z"),
      horaFin: new Date("2026-05-13T09:00:00Z"),
    };
    expect(verificarSolapamiento([], nuevo)).toBe(false);
  });
});

describe("obtenerEstadoTecnico", () => {
  it("retorna DISPONIBLE cuando no hay marcaje", () => {
    expect(obtenerEstadoTecnico(null)).toBe("DISPONIBLE");
  });

  it("retorna DISPONIBLE cuando el último marcaje ya está cerrado", () => {
    const m = {
      ...makeMarcaje({ horaFin: new Date() }),
      actividad: makeActividad({ productiva: true }),
    };
    expect(obtenerEstadoTecnico(m)).toBe("DISPONIBLE");
  });

  it("retorna PAUSA cuando tipo es PAUSA y está abierto", () => {
    const m = {
      ...makeMarcaje({ tipo: "PAUSA", horaFin: null }),
      actividad: makeActividad({ productiva: true }),
    };
    expect(obtenerEstadoTecnico(m)).toBe("PAUSA");
  });

  it("retorna ALMUERZO para actividad 'Almuerzo'", () => {
    const m = {
      ...makeMarcaje({ horaFin: null }),
      actividad: makeActividad({ nombre: "Almuerzo", productiva: false }),
    };
    expect(obtenerEstadoTecnico(m)).toBe("ALMUERZO");
  });

  it("retorna DETENIDO para actividad 'Espera repuesto'", () => {
    const m = {
      ...makeMarcaje({ horaFin: null }),
      actividad: makeActividad({ nombre: "Espera repuesto", productiva: false }),
    };
    expect(obtenerEstadoTecnico(m)).toBe("DETENIDO");
  });

  it("retorna TRABAJANDO para actividad productiva abierta", () => {
    const m = {
      ...makeMarcaje({ horaFin: null }),
      actividad: makeActividad({ nombre: "Reparación", productiva: true }),
    };
    expect(obtenerEstadoTecnico(m)).toBe("TRABAJANDO");
  });

  it("retorna DISPONIBLE para actividad no productiva genérica abierta", () => {
    const m = {
      ...makeMarcaje({ horaFin: null }),
      actividad: makeActividad({ nombre: "Reunión", productiva: false }),
    };
    expect(obtenerEstadoTecnico(m)).toBe("DISPONIBLE");
  });
});
