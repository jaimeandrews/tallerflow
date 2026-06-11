import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { canAccess } from "@/lib/auth/permissions";
import { CentroControlPageClient } from "./page-client";

export default async function CentroControlPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!canAccess(session.user.rol, "centro-control")) {
    redirect("/dashboard");
  }

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, codigo: true },
  });

  const sucursalActiva = sucursales.find((s) => s.id === session.user.sucursalId) ?? sucursales[0];

  // Turno actual de la sucursal — basado en hora local
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const horaActual = `${hh}:${mm}`;
  const turnos = await prisma.turno.findMany({
    where: { sucursalId: sucursalActiva?.id ?? "", activo: true },
    select: { id: true, nombre: true, horaInicio: true, horaFin: true },
  });
  const turnoActual =
    turnos.find((t) => horaActual >= t.horaInicio && horaActual <= t.horaFin) ?? null;

  return (
    <CentroControlPageClient
      sucursalActivaId={sucursalActiva?.id ?? ""}
      sucursalActivaNombre={sucursalActiva?.nombre ?? ""}
      turnoNombre={turnoActual?.nombre ?? null}
      canSelectSucursal={session.user.rol === "ADMIN"}
    />
  );
}
