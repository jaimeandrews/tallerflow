"use client";

import type { RolUsuario } from "@/generated/prisma";
import { ConfigLayout } from "@/components/configuracion/config-layout";

interface Props {
  rol: RolUsuario;
  sucursalId: string;
  sucursales: { id: string; nombre: string; codigo: string }[];
  userId: string;
}

export function ConfiguracionPageClient({ rol, sucursalId, sucursales, userId }: Props) {
  return <ConfigLayout rol={rol} sucursalId={sucursalId} sucursales={sucursales} userId={userId} />;
}
