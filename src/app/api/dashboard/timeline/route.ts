import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { inicioDelDia, resolverSucursalId, tonoDeMarcaje } from "@/lib/services/dashboard-service";
import type { TipoMarcaje } from "@/generated/prisma";

const queryShape = z.object({
  sucursalId: z.uuid().optional(),
  limite: z.coerce.number().int().min(1).max(100).default(15),
});

const TIPO_PUBLICO: Record<TipoMarcaje, "inicio" | "fin" | "pausa"> = {
  INICIO: "inicio",
  REANUDACION: "inicio",
  FIN: "fin",
  PAUSA: "pausa",
};

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const parsed = queryShape.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: "Parámetros inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const sucursalId = resolverSucursalId(user.rol, user.sucursalId, parsed.data.sucursalId);
  const { limite } = parsed.data;

  const desde = inicioDelDia();

  const marcajes = await prisma.marcaje.findMany({
    where: {
      sucursalId,
      horaInicio: { gte: desde },
    },
    orderBy: { horaInicio: "desc" },
    take: limite,
    select: {
      id: true,
      tipo: true,
      horaInicio: true,
      usuario: {
        select: { nombre: true, apellido: true, iniciales: true },
      },
      actividad: {
        select: { nombre: true, productiva: true },
      },
      ordenTrabajo: {
        select: { numero: true, proyecto: true },
      },
    },
  });

  const items = marcajes.map((m) => {
    const tono = tonoDeMarcaje({
      tipo: m.tipo,
      actividad: m.actividad,
    });

    const partes: string[] = [m.actividad.nombre];
    if (m.ordenTrabajo) {
      const proyecto = m.ordenTrabajo.proyecto ? ` (${m.ordenTrabajo.proyecto})` : "";
      partes.push(`${m.ordenTrabajo.numero}${proyecto}`);
    }

    return {
      id: m.id,
      hora: formatearHoraCorta(m.horaInicio),
      tecnico: formatearNombreTecnico(m.usuario),
      iniciales: m.usuario.iniciales,
      tipo: TIPO_PUBLICO[m.tipo],
      texto: partes.join(" · "),
      tono,
      horaInicio: m.horaInicio.toISOString(),
    };
  });

  return Response.json({ eventos: items });
}

function formatearHoraCorta(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatearNombreTecnico(u: { nombre: string; apellido: string }): string {
  const nombre = u.nombre.trim().toUpperCase();
  const apellido = u.apellido.trim();
  if (!apellido) return nombre;
  return `${nombre} ${apellido.charAt(0).toUpperCase()}.`;
}
