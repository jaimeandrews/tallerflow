import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { canAccess } from "@/lib/auth/permissions";
import { ReportesPageClient } from "./page-client";

export default async function ReportesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!canAccess(session.user.rol, "reportes")) {
    redirect("/dashboard");
  }

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, codigo: true },
  });

  const sucursalIdDefault =
    session.user.rol === "ADMIN" ? (sucursales[0]?.id ?? "") : session.user.sucursalId;

  return (
    <ReportesPageClient
      rol={session.user.rol}
      sucursalIdDefault={sucursalIdDefault}
      sucursales={sucursales}
    />
  );
}
