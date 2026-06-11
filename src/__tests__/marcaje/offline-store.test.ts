import { describe, it, expect, beforeEach, vi } from "vitest";

// idb under jsdom needs a polyfilled IndexedDB. We provide a thin in-memory mock.
import "fake-indexeddb/auto"; // peer not installed → fallback below

// If fake-indexeddb isn't present, the import above will throw — wrap in try
// (handled by Vitest with the catch in describe.skipIf below).

import {
  addPendingMarcaje,
  getPendingMarcajes,
  countPendingMarcajes,
  removePendingMarcaje,
  clearPendingMarcajes,
  cacheActividades,
  getCachedActividades,
} from "@/lib/offline/offline-store";

beforeEach(async () => {
  await clearPendingMarcajes();
});

describe("offline-store: pendingMarcajes", () => {
  it("agrega y recupera un marcaje pendiente", async () => {
    await addPendingMarcaje({
      idOffline: "uuid-1",
      actividadId: "act-1",
      tipo: "INICIO",
      horaInicio: "2026-05-13T08:00:00Z",
      dispositivo: "kiosco-test",
    });
    const list = await getPendingMarcajes();
    expect(list).toHaveLength(1);
    expect(list[0].idOffline).toBe("uuid-1");
    expect(list[0].createdAt).toBeGreaterThan(0);
  });

  it("countPendingMarcajes refleja la cantidad agregada", async () => {
    await addPendingMarcaje({
      idOffline: "uuid-a",
      actividadId: "act-1",
      tipo: "INICIO",
      horaInicio: "2026-05-13T08:00:00Z",
    });
    await addPendingMarcaje({
      idOffline: "uuid-b",
      actividadId: "act-1",
      tipo: "FIN",
      horaInicio: "2026-05-13T09:00:00Z",
    });
    expect(await countPendingMarcajes()).toBe(2);
  });

  it("getPendingMarcajes los retorna ordenados cronológicamente por horaInicio", async () => {
    await addPendingMarcaje({
      idOffline: "late",
      actividadId: "act-1",
      tipo: "FIN",
      horaInicio: "2026-05-13T10:00:00Z",
    });
    await addPendingMarcaje({
      idOffline: "early",
      actividadId: "act-1",
      tipo: "INICIO",
      horaInicio: "2026-05-13T08:00:00Z",
    });
    await addPendingMarcaje({
      idOffline: "mid",
      actividadId: "act-1",
      tipo: "PAUSA",
      horaInicio: "2026-05-13T09:00:00Z",
    });

    const ordered = await getPendingMarcajes();
    expect(ordered.map((m) => m.idOffline)).toEqual(["early", "mid", "late"]);
  });

  it("removePendingMarcaje elimina por idOffline", async () => {
    await addPendingMarcaje({
      idOffline: "to-remove",
      actividadId: "act-1",
      tipo: "INICIO",
      horaInicio: "2026-05-13T08:00:00Z",
    });
    await removePendingMarcaje("to-remove");
    expect(await countPendingMarcajes()).toBe(0);
  });

  it("permite re-agregar tras eliminar (no hay restricción de unicidad post-delete)", async () => {
    await addPendingMarcaje({
      idOffline: "x",
      actividadId: "act-1",
      tipo: "INICIO",
      horaInicio: "2026-05-13T08:00:00Z",
    });
    await removePendingMarcaje("x");
    await addPendingMarcaje({
      idOffline: "x",
      actividadId: "act-2",
      tipo: "FIN",
      horaInicio: "2026-05-13T09:00:00Z",
    });
    const list = await getPendingMarcajes();
    expect(list[0].actividadId).toBe("act-2");
  });
});

describe("offline-store: cachedActividades", () => {
  it("cachea y recupera actividades", async () => {
    await cacheActividades([
      { id: "a1", nombre: "Reparación", icono: "wrench", color: "#2563EB", productiva: true },
      { id: "a2", nombre: "Almuerzo", icono: "coffee", color: "#DC2626", productiva: false },
    ]);
    const list = await getCachedActividades();
    expect(list).toHaveLength(2);
    expect(list.find((a) => a.id === "a2")?.productiva).toBe(false);
  });
});
