/**
 * Motor de alertas.
 *
 * `evaluarAlertas(sucursalId)` recorre todas las `ConfiguracionSLA` activas
 * de la sucursal y, para cada regla, busca condiciones que la disparen.
 *
 * Para evitar generar alertas duplicadas, antes de crear una nueva se
 * verifica si existe otra abierta (`resuelta: false`) con la misma
 * `configuracionSlaId` y el mismo `entityKey` dentro del campo `datos`
 * (serializado JSON).
 *
 * Las alertas creadas se emiten por Socket.io vía `socketEmit.alertaNueva`.
 * `resolverAlerta` marca como resuelta, registra auditoría y emite
 * `socketEmit.alertaResuelta`.
 */

import type { Alerta } from "@/generated/prisma";
import { prisma } from "@/lib/db/prisma";
import { socketEmit } from "@/lib/socket/socket-emitter";
import { registrarAuditoria } from "./auditoria-service";
import type { AlertaPayload } from "@/lib/socket/socket-events";
import type { NivelAlerta } from "@/types/centro-control";

// ── Convenciones ──────────────────────────────────────────────────────────

export type CondicionAlerta =
  | "tecnico_detenido"
  | "of_sobre_sla"
  | "tecnico_pausa_larga"
  | "kiosco_inactivo";

const CONDICIONES_VALIDAS: Set<string> = new Set<CondicionAlerta>([
  "tecnico_detenido",
  "of_sobre_sla",
  "tecnico_pausa_larga",
  "kiosco_inactivo",
]);

function normalizarNivel(raw: string): NivelAlerta {
  const n = raw.toLowerCase();
  if (n === "critico" || n === "critical" || n === "critica") return "critico";
  if (n === "warning" || n === "advertencia") return "warning";
  return "info";
}

// ── Helpers ───────────────────────────────────────────────────────────────

function alertaToPayload(a: Alerta): AlertaPayload {
  let datos: Record<string, unknown> | null = null;
  if (a.datos) {
    try {
      const parsed = JSON.parse(a.datos);
      datos =
        typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      datos = null;
    }
  }
  return {
    id: a.id,
    titulo: a.titulo,
    descripcion: a.descripcion,
    nivel: normalizarNivel(a.nivel),
    sucursalId: a.sucursalId,
    configuracionSlaId: a.configuracionSlaId,
    resuelta: a.resuelta,
    datos,
    createdAt: a.createdAt.toISOString(),
  };
}

function formatDuracionCorta(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface EntityKey {
  /** Tipo de entidad que origina la alerta (clave en `datos`). */
  type: "tecnicoId" | "ofId" | "dispositivo";
  /** Identificador único de esa entidad. */
  id: string;
}

interface CrearAlertaParams {
  sucursalId: string;
  configuracionSlaId: string;
  titulo: string;
  descripcion: string;
  nivel: string;
  entityKey: EntityKey;
}

/**
 * Crea una alerta sólo si NO existe otra abierta para la misma combinación
 * (regla + entidad). Devuelve la alerta creada o `null` si era duplicada.
 */
async function crearSiNoExiste(params: CrearAlertaParams): Promise<Alerta | null> {
  const existentes = await prisma.alerta.findMany({
    where: {
      sucursalId: params.sucursalId,
      configuracionSlaId: params.configuracionSlaId,
      resuelta: false,
    },
    select: { id: true, datos: true },
  });
  for (const a of existentes) {
    if (!a.datos) continue;
    try {
      const datos = JSON.parse(a.datos) as Record<string, unknown>;
      if (datos[params.entityKey.type] === params.entityKey.id) {
        return null; // ya hay una alerta abierta para esta entidad
      }
    } catch {
      // datos corruptos — ignorar para no bloquear nuevas alertas
    }
  }
  return prisma.alerta.create({
    data: {
      sucursalId: params.sucursalId,
      configuracionSlaId: params.configuracionSlaId,
      titulo: params.titulo,
      descripcion: params.descripcion,
      nivel: params.nivel,
      resuelta: false,
      datos: JSON.stringify({ [params.entityKey.type]: params.entityKey.id }),
    },
  });
}

// ── Evaluadores por condición ─────────────────────────────────────────────

async function evaluarTecnicoDetenido(
  sucursalId: string,
  configuracionSlaId: string,
  umbralMinutos: number,
  nivel: string,
  ruleNombre: string,
  generadas: Alerta[]
) {
  const cutoff = new Date(Date.now() - umbralMinutos * 60_000);

  const marcajes = await prisma.marcaje.findMany({
    where: {
      sucursalId,
      horaFin: null,
      horaInicio: { lte: cutoff },
      actividad: { nombre: "Espera repuesto" },
    },
    select: {
      usuarioId: true,
      horaInicio: true,
      usuario: {
        select: { nombre: true, apellido: true },
      },
      ordenTrabajo: { select: { numero: true } },
    },
  });

  for (const m of marcajes) {
    const minutosDetenido = Math.floor((Date.now() - m.horaInicio.getTime()) / 60_000);
    const nombreTec =
      `${m.usuario.nombre.toUpperCase()} ${m.usuario.apellido.toUpperCase()}`.trim();
    const a = await crearSiNoExiste({
      sucursalId,
      configuracionSlaId,
      titulo: `${nombreTec} detenido ${formatDuracionCorta(minutosDetenido)}`,
      descripcion: m.ordenTrabajo
        ? `${m.ordenTrabajo.numero} · espera repuesto · supera ${ruleNombre}`
        : `Espera repuesto · supera ${ruleNombre}`,
      nivel,
      entityKey: { type: "tecnicoId", id: m.usuarioId },
    });
    if (a) generadas.push(a);
  }
}

async function evaluarOfSobreSla(
  sucursalId: string,
  configuracionSlaId: string,
  nivel: string,
  generadas: Alerta[]
) {
  const ofs = await prisma.ordenTrabajo.findMany({
    where: {
      sucursalId,
      eliminada: false,
      estado: { not: "FINALIZADA" },
      slaVencimiento: { lt: new Date() },
    },
    select: {
      id: true,
      numero: true,
      nombre: true,
      slaVencimiento: true,
      estado: true,
    },
  });

  for (const of of ofs) {
    if (!of.slaVencimiento) continue;
    const minutosVencido = Math.floor((Date.now() - of.slaVencimiento.getTime()) / 60_000);
    const a = await crearSiNoExiste({
      sucursalId,
      configuracionSlaId,
      titulo: `${of.numero} sobre SLA · ${formatDuracionCorta(minutosVencido)}`,
      descripcion: `${of.nombre} · estado ${of.estado.toLowerCase()}`,
      nivel,
      entityKey: { type: "ofId", id: of.id },
    });
    if (a) generadas.push(a);
  }
}

async function evaluarTecnicoPausaLarga(
  sucursalId: string,
  configuracionSlaId: string,
  umbralMinutos: number,
  nivel: string,
  generadas: Alerta[]
) {
  const cutoff = new Date(Date.now() - umbralMinutos * 60_000);

  const marcajes = await prisma.marcaje.findMany({
    where: {
      sucursalId,
      horaFin: null,
      tipo: "PAUSA",
      horaInicio: { lte: cutoff },
    },
    select: {
      usuarioId: true,
      horaInicio: true,
      notas: true,
      usuario: { select: { nombre: true, apellido: true } },
    },
  });

  for (const m of marcajes) {
    const minutosPausa = Math.floor((Date.now() - m.horaInicio.getTime()) / 60_000);
    const nombreTec =
      `${m.usuario.nombre.toUpperCase()} ${m.usuario.apellido.toUpperCase()}`.trim();
    const a = await crearSiNoExiste({
      sucursalId,
      configuracionSlaId,
      titulo: `${nombreTec} en pausa ${formatDuracionCorta(minutosPausa)}`,
      descripcion: m.notas
        ? `Motivo: ${m.notas}`
        : `Pausa supera el umbral de ${umbralMinutos} min`,
      nivel,
      entityKey: { type: "tecnicoId", id: m.usuarioId },
    });
    if (a) generadas.push(a);
  }
}

async function evaluarKioscoInactivo(
  sucursalId: string,
  configuracionSlaId: string,
  umbralMinutos: number,
  nivel: string,
  generadas: Alerta[]
) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const cutoff = new Date(Date.now() - umbralMinutos * 60_000);

  // Último marcaje por dispositivo "kiosco-*" hoy
  const marcajes = await prisma.marcaje.findMany({
    where: {
      sucursalId,
      horaInicio: { gte: inicioHoy },
      dispositivo: { startsWith: "kiosco-" },
    },
    orderBy: { horaInicio: "desc" },
    select: { dispositivo: true, horaInicio: true },
  });

  const latestPorDevice = new Map<string, Date>();
  for (const m of marcajes) {
    if (!m.dispositivo) continue;
    if (!latestPorDevice.has(m.dispositivo)) {
      latestPorDevice.set(m.dispositivo, m.horaInicio);
    }
  }

  for (const [dispositivo, latest] of latestPorDevice) {
    if (latest.getTime() < cutoff.getTime()) {
      const minutosInactivo = Math.floor((Date.now() - latest.getTime()) / 60_000);
      const a = await crearSiNoExiste({
        sucursalId,
        configuracionSlaId,
        titulo: `Kiosco ${dispositivo} inactivo ${formatDuracionCorta(minutosInactivo)}`,
        descripcion: `Último marcaje a las ${String(latest.getHours()).padStart(2, "0")}:${String(latest.getMinutes()).padStart(2, "0")}`,
        nivel,
        entityKey: { type: "dispositivo", id: dispositivo },
      });
      if (a) generadas.push(a);
    }
  }
}

// ── Entrypoint principal ──────────────────────────────────────────────────

export async function evaluarAlertas(sucursalId: string): Promise<Alerta[]> {
  const reglas = await prisma.configuracionSLA.findMany({
    where: { sucursalId, activa: true },
    select: {
      id: true,
      condicion: true,
      umbralMinutos: true,
      nivelAlerta: true,
      nombre: true,
    },
  });

  const generadas: Alerta[] = [];

  for (const r of reglas) {
    if (!CONDICIONES_VALIDAS.has(r.condicion)) continue;
    try {
      switch (r.condicion as CondicionAlerta) {
        case "tecnico_detenido":
          await evaluarTecnicoDetenido(
            sucursalId,
            r.id,
            r.umbralMinutos,
            r.nivelAlerta,
            r.nombre,
            generadas
          );
          break;
        case "of_sobre_sla":
          await evaluarOfSobreSla(sucursalId, r.id, r.nivelAlerta, generadas);
          break;
        case "tecnico_pausa_larga":
          await evaluarTecnicoPausaLarga(
            sucursalId,
            r.id,
            r.umbralMinutos,
            r.nivelAlerta,
            generadas
          );
          break;
        case "kiosco_inactivo":
          await evaluarKioscoInactivo(sucursalId, r.id, r.umbralMinutos, r.nivelAlerta, generadas);
          break;
      }
    } catch (err) {
      console.error(`[alertas] error evaluando regla ${r.id} (${r.condicion}):`, err);
    }
  }

  // Emitir por WS cada alerta nueva
  for (const a of generadas) {
    socketEmit.alertaNueva(sucursalId, { alerta: alertaToPayload(a) });
  }

  return generadas;
}

// ── Resolver ──────────────────────────────────────────────────────────────

export interface ResolverResult {
  ok: boolean;
  error?: string;
  alerta?: Alerta;
}

export async function resolverAlerta(params: {
  alertaId: string;
  usuarioId: string;
  usuarioNombre: string;
  ip?: string;
}): Promise<ResolverResult> {
  const existente = await prisma.alerta.findUnique({
    where: { id: params.alertaId },
    select: { id: true, sucursalId: true, resuelta: true },
  });

  if (!existente) {
    return { ok: false, error: "Alerta no encontrada" };
  }
  if (existente.resuelta) {
    return { ok: false, error: "La alerta ya fue resuelta" };
  }

  const alerta = await prisma.alerta.update({
    where: { id: params.alertaId },
    data: {
      resuelta: true,
      resueltaPorId: params.usuarioId,
      resueltaEn: new Date(),
    },
  });

  void registrarAuditoria({
    usuarioId: params.usuarioId,
    accion: "RESOLVER_ALERTA",
    entidad: "Alerta",
    entidadId: alerta.id,
    datosNuevos: { resuelta: true },
    ip: params.ip,
  });

  socketEmit.alertaResuelta(existente.sucursalId, {
    alertaId: alerta.id,
    resueltaPor: { id: params.usuarioId, nombre: params.usuarioNombre },
  });

  return { ok: true, alerta };
}

// ── Scheduler interno (Opción A) ──────────────────────────────────────────

declare global {
   
  var __tallerflowAlertasScheduler:
    | { interval: NodeJS.Timeout; runningInitialEval: boolean }
    | undefined;
}

const SCHEDULER_TICK_MS = 60_000; // 60s — spec

export async function evaluarTodasLasSucursales(): Promise<void> {
  const sucursales = await prisma.sucursal.findMany({
    where: { activa: true },
    select: { id: true },
  });
  for (const s of sucursales) {
    try {
      await evaluarAlertas(s.id);
    } catch (err) {
      console.error(`[alertas] error sucursal ${s.id}:`, err);
    }
  }
}

export function startAlertasScheduler(): void {
  if (globalThis.__tallerflowAlertasScheduler) {
    return; // ya corre (sobrevive HMR vía globalThis)
  }

  const tick = () => {
    evaluarTodasLasSucursales().catch((err) => console.error("[alertas] tick error:", err));
  };

  // Primer disparo a los 5s (le da tiempo al servidor a estabilizar conexiones)
  setTimeout(tick, 5_000);

  const interval = setInterval(tick, SCHEDULER_TICK_MS);
  globalThis.__tallerflowAlertasScheduler = { interval, runningInitialEval: true };
  console.log(`[alertas] scheduler iniciado (cada ${SCHEDULER_TICK_MS / 1000}s)`);
}
