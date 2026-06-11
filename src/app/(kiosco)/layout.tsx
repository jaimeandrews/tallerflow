import { prisma } from "@/lib/db/prisma";
import { KioskoShell } from "@/components/marcaje/kiosko-shell";

export const dynamic = "force-dynamic";

export const metadata = { title: "TallerFlow · Marcaje Kiosco" };

export default async function KioscoLayout({ children }: { children: React.ReactNode }) {
  const nombreEnv = process.env.KIOSCO_SUCURSAL_NOMBRE?.trim();
  const sucursal = await prisma.sucursal.findFirst({
    where: { activa: true, ...(nombreEnv ? { nombre: nombreEnv } : {}) },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });

  return (
    <KioskoShell sucursalId={sucursal?.id ?? ""} sucursalNombre={sucursal?.nombre ?? "Sucursal"}>
      {children}
    </KioskoShell>
  );
}
