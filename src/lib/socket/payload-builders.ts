/**
 * Constructores de payloads para eventos Socket.io.
 *
 * Centralizan la conversión Date → ISO string y la composición del shape
 * que esperan los consumidores (centro de control, kiosco), evitando
 * duplicar mapeos en cada endpoint emisor.
 */

import type { Actividad, OrdenTrabajo, TipoMarcaje } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import type { MarcajePayload, TecnicoMiniPayload } from "./socket-events";

export interface MarcajeWithRelations {
  id: string;
  tipo: TipoMarcaje;
  horaInicio: Date;
  horaFin: Date | null;
  duracionMinutos: number | null;
  actividad: Pick<Actividad, "id" | "nombre" | "color" | "productiva">;
  ordenTrabajo: Pick<OrdenTrabajo, "id" | "numero" | "nombre"> | null;
}

export function marcajeToPayload(
  marcaje: MarcajeWithRelations,
  sucursalId: string
): MarcajePayload {
  return {
    id: marcaje.id,
    tipo: marcaje.tipo,
    horaInicio: marcaje.horaInicio.toISOString(),
    horaFin: marcaje.horaFin ? marcaje.horaFin.toISOString() : null,
    duracionMinutos: marcaje.duracionMinutos,
    sucursalId,
    actividad: {
      id: marcaje.actividad.id,
      nombre: marcaje.actividad.nombre,
      color: marcaje.actividad.color,
      productiva: marcaje.actividad.productiva,
    },
    ordenTrabajo: marcaje.ordenTrabajo
      ? {
          id: marcaje.ordenTrabajo.id,
          numero: marcaje.ordenTrabajo.numero,
          nombre: marcaje.ordenTrabajo.nombre,
        }
      : null,
  };
}

/**
 * Resuelve la info mínima del técnico (nombre completo, iniciales, color)
 * para acompañar los eventos. Hace una query rápida indexada por PK.
 *
 * Devuelve null si el usuario fue eliminado entre la creación del marcaje
 * y la emisión — los call-sites deben tratarlo como "no emitir".
 */
export async function getTecnicoMini(usuarioId: string): Promise<TecnicoMiniPayload | null> {
  const u = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      nombre: true,
      apellido: true,
      iniciales: true,
      color: true,
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    nombre: `${u.nombre} ${u.apellido}`.trim(),
    iniciales: u.iniciales,
    color: u.color,
  };
}
