"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDefaultRoute } from "@/lib/auth/permissions";
import type { RolUsuario } from "@/generated/prisma";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // A10: sanitize callbackUrl to prevent open-redirect attacks.
  // Only allow same-origin relative paths (must start with "/" but not "//").
  // "//evil.com" is a protocol-relative URL that would redirect off-site.
  const raw = searchParams.get("callbackUrl") ?? "";
  const callbackUrl = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Credenciales incorrectas. Verifica tu email y contraseña.");
    } else {
      // If no explicit callbackUrl was in the URL, determine the correct post-login
      // destination from the session role so that, e.g., TECNICO lands on /tecnico
      // instead of being bounced from /dashboard back to /login.
      let target = callbackUrl;
      if (!raw) {
        const sessionRes = await fetch("/api/auth/session");
        if (sessionRes.ok) {
          const session = (await sessionRes.json()) as { user?: { rol?: RolUsuario } };
          const rol = session?.user?.rol;
          if (rol) target = getDefaultRoute(rol);
        }
      }
      router.push(target);
      router.refresh();
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#006FA0] text-white text-2xl font-bold shadow-lg">
            T
          </div>
          <h1 className="text-2xl font-bold text-white">TallerFlow</h1>
          <p className="text-slate-400 text-sm">Sistema de marcaje técnico</p>
        </div>

        {/* Form */}
        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">Iniciar sesión</CardTitle>
            <CardDescription className="text-slate-400">
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium text-slate-300">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@tallerflow.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-slate-300">
                  Contraseña
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-[#006FA0] hover:bg-[#005a82] text-white"
                disabled={loading}
              >
                {loading ? "Verificando..." : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-500">TallerFlow v0.1.0 · Sistema interno</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
