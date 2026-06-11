import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser } from "@/lib/auth/api-auth";
import { verificarSolapamiento } from "@/lib/services/marcaje-service";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { socketEmit } from "@/lib/socket/socket-emitter";
import {
  getTecnicoMini,
  marcajeToPayload,
  type MarcajeWithRelations,
} from "@/lib/socket/payload-builders";

const MAX_FUTURE_MS = 60 * 1000; // 1 minute tolerance for clock drift
const MAX_PAST_MS = 24 * 60 * 60 * 1000; // 24 hours

function validTimestamp(iso: string, now: number): boolean {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return false;
  if (t > now + MAX_FUTURE_MS) return false;
  if (t < now - MAX_PAST_MS) return false;
  return true;
}

const syncItemSchema = z.object({
  idOffline: z.string().min(1).max(64),
  actividadId: z.string().uuid(),
  ordenTrabajoId: z.string().uuid().optional(),
  tipo: z.enum(["INICIO", "FIN", "PAUSA", "REANUDACION"]),
  horaInicio: z.string().datetime(),
  horaFin: z.string().datetime().optional(),
  dispositivo: z.string().max(64).optional(),
  notas: z.string().max(500).optional(),
});

const schema = z.object({
  marcajes: z.array(syncItemSchema).min(1).max(100),
});

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const now = Date.now();
  // Sort chronologically (oldest first) — critical for state continuity
  const marcajes = [...parsed.data.marcajes].sort(
    (a, b) => new Date(a.horaInicio).getTime() - new Date(b.horaInicio).getTime()
  );

  // Validate actividad scoping (must be global or belong to user's sucursal)
  const actividadIds = [...new Set(marcajes.map((m) => m.actividadId))];
  const actividades = await prisma.actividad.findMany({
    where: {
      id: { in: actividadIds },
      OR: [{ sucursalId: null }, { sucursalId: user.sucursalId }],
    },
    select: { id: true },
  });
  const validActividadIds = new Set(actividades.map((a) => a.id));

  // Validate OF scoping (must belong to user's sucursal) — collected per-batch
  const ofIds = [...new Set(marcajes.map((m) => m.ordenTrabajoId).filter(Boolean) as string[])];
  const ofs = await prisma.ordenTrabajo.findMany({
    where: { id: { in: ofIds }, sucursalId: user.sucursalId },
    select: { id: true, estado: true },
  });
  const ofStatusMap = new Map(ofs.map((o) => [o.id, o.estado] as const));

  const fechaMin = marcajes.length
    ? new Date(new Date(marcajes[0].horaInicio).getTime() - 1000)
    : new Date(now - MAX_PAST_MS);

  const existingMarcajes = await prisma.marcaje.findMany({
    where: { usuarioId: user.id, horaInicio: { gte: fechaMin } },
  });

  let sincronizados = 0;
  let duplicados = 0;
  const errores: string[] = [];
  const afectedOfs = new Set<string>();
  const creados: MarcajeWithRelations[] = [];

  for (const item of marcajes) {
    // Timestamp bounds
    if (!validTimestamp(item.horaInicio, now)) {
      errores.push(`${item.idOffline}: horaInicio fuera de rango (futuro o >24h en pasado)`);
      continue;
    }
    if (item.horaFin && !validTimestamp(item.horaFin, now)) {
      errores.push(`${item.idOffline}: horaFin fuera de rango`);
      continue;
    }
    if (item.horaFin && new Date(item.horaFin).getTime() < new Date(item.horaInicio).getTime()) {
      errores.push(`${item.idOffline}: horaFin anterior a horaInicio`);
      continue;
    }

    // Scoping: actividad must be reachable
    if (!validActividadIds.has(item.actividadId)) {
      errores.push(`${item.idOffline}: actividad no pertenece a su sucursal`);
      continue;
    }

    // Scoping: OF must belong to sucursal
    if (item.ordenTrabajoId) {
      if (!ofStatusMap.has(item.ordenTrabajoId)) {
        errores.push(`${item.idOffline}: OF no pertenece a su sucursal`);
        continue;
      }
      if (ofStatusMap.get(item.ordenTrabajoId) === "FINALIZADA") {
        // OF finalized while user was offline — store as orphan for audit
        void registrarAuditoria({
          usuarioId: user.id,
          accion: "MARCAJE_HUERFANO",
          entidad: "Marcaje",
          entidadId: item.idOffline,
          datosNuevos: {
            level: "SEGURIDAD",
            reason: "OF finalizada mientras técnico offline",
            of: item.ordenTrabajoId,
          },
        });
        errores.push(`${item.idOffline}: OF ya finalizada (registrado como huérfano)`);
        continue;
      }
    }

    // Dedup
    const dup = await prisma.marcaje.findUnique({ where: { idOffline: item.idOffline } });
    if (dup) {
      duplicados++;
      continue;
    }

    const horaInicio = new Date(item.horaInicio);
    const horaFin = item.horaFin ? new Date(item.horaFin) : undefined;

    if (verificarSolapamiento(existingMarcajes, { horaInicio, horaFin })) {
      errores.push(`${item.idOffline}: solapamiento con marcaje existente`);
      continue;
    }

    const duracionMinutos = horaFin ? (horaFin.getTime() - horaInicio.getTime()) / 60000 : null;

    try {
      const created = await prisma.marcaje.create({
        data: {
          usuarioId: user.id,
          actividadId: item.actividadId,
          ordenTrabajoId: item.ordenTrabajoId ?? null,
          tipo: item.tipo,
          horaInicio,
          horaFin: horaFin ?? null,
          duracionMinutos,
          sucursalId: user.sucursalId,
          dispositivo: item.dispositivo ?? null,
          notas: item.notas ?? null,
          idOffline: item.idOffline,
          creadoOffline: true,
          sincronizado: true,
        },
        include: {
          actividad: {
            select: { id: true, nombre: true, color: true, productiva: true },
          },
          ordenTrabajo: { select: { id: true, numero: true, nombre: true } },
        },
      });
      sincronizados++;
      // Add to existing list so subsequent items in the same batch see it for solapamiento checks
      existingMarcajes.push(created);
      creados.push(created);
      if (item.ordenTrabajoId) afectedOfs.add(item.ordenTrabajoId);
    } catch (err) {
      errores.push(`${item.idOffline}: error al crear (${String(err)})`);
    }
  }

  // Recalculate hhConsumidas for affected OFs
  for (const ofId of afectedOfs) {
    const todosMarcajes = await prisma.marcaje.findMany({
      where: {
        ordenTrabajoId: ofId,
        horaFin: { not: null },
        duracionMinutos: { not: null },
      },
    });
    const hhConsumidas = todosMarcajes.reduce((acc, m) => acc + (m.duracionMinutos ?? 0) / 60, 0);
    await prisma.ordenTrabajo.update({
      where: { id: ofId },
      data: { hhConsumidas },
    });
  }

  // ── Emisiones Socket.io ────────────────────────────────────────────────
  // Un evento marcaje:nuevo por cada marcaje sincronizado. El centro de
  // control debe estar preparado para batches grandes (UI puede agrupar).
  if (creados.length > 0) {
    void (async () => {
      const tecnico = await getTecnicoMini(user.id);
      if (!tecnico) return;
      for (const m of creados) {
        socketEmit.marcajeNuevo(user.sucursalId, {
          marcaje: marcajeToPayload(m, user.sucursalId),
          tecnico,
          of: m.ordenTrabajo ? { id: m.ordenTrabajo.id, numero: m.ordenTrabajo.numero } : null,
        });
      }
    })();
  }

  return Response.json({ sincronizados, duplicados, errores });
}
