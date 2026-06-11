import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { Toaster } from "@/components/ui/sonner";
import TecnicoHeader from "./tecnico-header";

export const metadata = { title: "TallerFlow · Vista Técnico" };

export default async function TecnicoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TecnicoHeader
        nombre={session.user.nombre}
        apellido={session.user.apellido}
        iniciales={session.user.iniciales}
        rol={session.user.rol}
        color={session.user.color}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <Toaster richColors position="top-center" />
    </div>
  );
}
