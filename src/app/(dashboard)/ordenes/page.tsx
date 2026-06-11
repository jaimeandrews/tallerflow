import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { canAccess } from "@/lib/auth/permissions";
import { OrdenesPageClient } from "./page-client";

export default async function OrdenesPage({
  searchParams,
}: {
  searchParams: Promise<{ busqueda?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!canAccess(session.user.rol, "ordenes")) {
    redirect("/dashboard");
  }

  const { busqueda } = await searchParams;

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, codigo: true },
  });

  const sucursalActiva = sucursales.find((s) => s.id === session.user.sucursalId) ?? sucursales[0];

  return (
    <OrdenesPageClient
      rol={session.user.rol}
      sucursales={sucursales}
      sucursalActivaId={sucursalActiva?.id ?? ""}
      sucursalActivaNombre={sucursalActiva?.nombre ?? ""}
      initialBusqueda={busqueda}
    />
  );
}
