import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { getDefaultRoute } from "@/lib/auth/permissions";

export default async function RootPage() {
  const session = await auth();
  if (session?.user) {
    redirect(getDefaultRoute(session.user.rol));
  }
  redirect("/login");
}
