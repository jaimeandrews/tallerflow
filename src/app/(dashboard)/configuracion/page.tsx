import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { canAccess } from "@/lib/auth/permissions";
import { ConfiguracionPageClient } from "./page-client";

export default async function ConfiguracionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccess(session.user.rol, "configuracion")) redirect("/dashboard");

  // ADMIN and CONTROL_GESTION see all branches (CONTROL_GESTION needs them for the audit filter)
  const needsAllSucursales = ["ADMIN", "CONTROL_GESTION"].includes(session.user.rol);
  const sucursales = await prisma.sucursal.findMany({
    where: needsAllSucursales ? {} : { id: session.user.sucursalId },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, codigo: true },
  });

  return (
    <ConfiguracionPageClient
      rol={session.user.rol}
      sucursalId={session.user.sucursalId}
      sucursales={sucursales}
      userId={session.user.id}
    />
  );
}
