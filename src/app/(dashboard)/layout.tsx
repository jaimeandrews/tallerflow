import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { SucursalProvider } from "@/contexts/sucursal-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, codigo: true },
  });

  const sucursalActiva = sucursales.find((s) => s.id === session.user.sucursalId) ?? sucursales[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <SucursalProvider initialId={sucursalActiva.id} sucursales={sucursales}>
        <Sidebar
          user={{
            nombre: session.user.nombre,
            apellido: session.user.apellido,
            iniciales: session.user.iniciales,
            rol: session.user.rol,
            sucursalId: session.user.sucursalId,
            color: session.user.color,
          }}
        />

        {/* Main content area */}
        <div data-tallerflow-shell className="lg:pl-64 flex flex-col min-h-screen">
          <Topbar
            breadcrumb={["TallerFlow"]}
            user={{
              nombre: session.user.nombre,
              apellido: session.user.apellido,
              email: session.user.email ?? undefined,
              iniciales: session.user.iniciales,
              rol: session.user.rol,
              color: session.user.color,
              sucursalNombre: sucursalActiva?.nombre,
            }}
          />
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </SucursalProvider>
    </div>
  );
}
