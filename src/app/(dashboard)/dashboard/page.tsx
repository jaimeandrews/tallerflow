import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { canAccess } from "@/lib/auth/permissions";
import { puedeGestionarOF } from "@/lib/services/ordenes-service";
import { DashboardPageClient } from "./page-client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!canAccess(session.user.rol, "dashboard")) {
    redirect("/login");
  }

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, codigo: true },
  });

  const sucursalActiva = sucursales.find((s) => s.id === session.user.sucursalId) ?? sucursales[0];

  return (
    <DashboardPageClient
      rol={session.user.rol}
      nombreUsuario={session.user.nombre}
      sucursales={sucursales}
      sucursalActivaId={sucursalActiva?.id ?? ""}
      canSelectSucursal={session.user.rol === "ADMIN"}
      canCreateOF={puedeGestionarOF(session.user.rol)}
    />
  );
}
