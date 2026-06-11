"use client";

import { createContext, useContext, useState, useCallback } from "react";
import type { AuthUser } from "@/lib/auth/api-auth";
import type { MarcajeActivo } from "@/types/marcaje";

interface KioskoState {
  user: AuthUser | null;
  token: string | null;
  sucursalId: string;
  marcajeActivo: MarcajeActivo | null;
  setAuth: (user: AuthUser, token: string, jti: string, expiresAt: number) => void;
  clearAuth: () => void;
  setMarcajeActivo: (m: MarcajeActivo | null) => void;
}

const KioskoContext = createContext<KioskoState | null>(null);

export function useKiosko() {
  const ctx = useContext(KioskoContext);
  if (!ctx) throw new Error("useKiosko must be used within KioskoProvider");
  return ctx;
}

export function KioskoProvider({
  sucursalId,
  children,
}: {
  sucursalId: string;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [jti, setJti] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [marcajeActivo, setMarcajeActivo] = useState<MarcajeActivo | null>(null);

  const setAuth = useCallback((u: AuthUser, t: string, j: string, exp: number) => {
    setUser(u);
    setToken(t);
    setJti(j);
    setExpiresAt(exp);
  }, []);

  const clearAuth = useCallback(() => {
    // A04: Revoke the Bearer token server-side before clearing client state.
    // This prevents reuse of the JWT after explicit or auto-logout, even though
    // the token hasn't expired yet (max 8 hours / one shift).
    if (token && jti && expiresAt) {
      fetch("/api/auth/kiosco-logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ jti, expiresAt }),
      }).catch(() => {
        // Fire-and-forget — even if the request fails the client state is cleared.
        // The token will expire naturally within one shift.
      });
    }

    setUser(null);
    setToken(null);
    setJti(null);
    setExpiresAt(null);
    setMarcajeActivo(null);
  }, [token, jti, expiresAt]);

  return (
    <KioskoContext.Provider
      value={{ user, token, sucursalId, marcajeActivo, setMarcajeActivo, setAuth, clearAuth }}
    >
      {children}
    </KioskoContext.Provider>
  );
}
