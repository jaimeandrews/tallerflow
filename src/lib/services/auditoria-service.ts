import { prisma } from "@/lib/db/prisma";

interface AuditoriaParams {
  usuarioId?: string;
  accion: string;
  entidad: string;
  entidadId?: string;
  datosAnteriores?: unknown;
  datosNuevos?: unknown;
  ip?: string;
  dispositivo?: string;
}

export async function registrarAuditoria(params: AuditoriaParams): Promise<void> {
  try {
    await prisma.logAuditoria.create({
      data: {
        usuarioId: params.usuarioId,
        accion: params.accion,
        entidad: params.entidad,
        entidadId: params.entidadId,
        datosAnteriores: params.datosAnteriores
          ? JSON.stringify(params.datosAnteriores)
          : undefined,
        datosNuevos: params.datosNuevos ? JSON.stringify(params.datosNuevos) : undefined,
        ip: params.ip,
        dispositivo: params.dispositivo,
      },
    });
  } catch (err) {
    console.error("[auditoria] failed to log:", err);
  }
}
