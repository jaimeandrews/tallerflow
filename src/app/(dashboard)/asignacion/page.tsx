import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { canAccess } from "@/lib/auth/permissions";
import { AsignacionPageClient } from "./page-client";

export default async function AsignacionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!canAccess(session.user.rol, "asignacion")) {
    redirect("/dashboard");
  }

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, codigo: true },
  });

  const sucursalActiva = sucursales.find((s) => s.id === session.user.sucursalId) ?? sucursales[0];

  return (
    <AsignacionPageClient
      rol={session.user.rol}
      sucursalActivaId={sucursalActiva?.id ?? ""}
      sucursalActivaNombre={sucursalActiva?.nombre ?? "Sucursal"}
    />
  );
}
