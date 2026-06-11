"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

type SucursalInfo = { id: string; nombre: string; codigo: string };

interface SucursalContextValue {
  sucursalActivaId: string;
  sucursalActiva: SucursalInfo;
  sucursales: SucursalInfo[];
  setSucursalActivaId: (id: string) => void;
}

const SucursalContext = createContext<SucursalContextValue | null>(null);

export function SucursalProvider({
  children,
  initialId,
  sucursales,
}: {
  children: ReactNode;
  initialId: string;
  sucursales: SucursalInfo[];
}) {
  const [sucursalActivaId, setSucursalActivaId] = useState(initialId);
  const sucursalActiva = sucursales.find((s) => s.id === sucursalActivaId) ?? sucursales[0];

  return (
    <SucursalContext.Provider
      value={{ sucursalActivaId, sucursalActiva, sucursales, setSucursalActivaId }}
    >
      {children}
    </SucursalContext.Provider>
  );
}

export function useSucursalActiva() {
  const ctx = useContext(SucursalContext);
  if (!ctx) throw new Error("useSucursalActiva must be used within SucursalProvider");
  return ctx;
}
