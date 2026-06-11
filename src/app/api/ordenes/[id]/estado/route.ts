import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthUser, getClientIp } from "@/lib/auth/api-auth";
import { registrarAuditoria } from "@/lib/services/auditoria-service";
import { puedeGestionarOF, validarTransicionEstado } from "@/lib/services/ordenes-service";
import { cambiarEstadoOFSchema } from "@/lib/utils/validators";
import { socketEmit } from "@/lib/socket/socket-emitter";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request);
  if (!user) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!puedeGestionarOF(user.rol)) {
    return Response.json({ error: "Sin permisos para cambiar estado de OF" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = cambiarEstadoOFSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { estado: estadoNuevo } = parsed.data;

  const existente = await prisma.ordenTrabajo.findFirst({
    where: { id, eliminada: false },
    select: { id: true, estado: true, sucursalId: true, numero: true },
  });

  if (!existente) {
    return Response.json({ error: "OF no encontrada" }, { status: 404 });
  }

  if (user.rol !== "ADMIN" && existente.sucursalId !== user.sucursalId) {
    return Response.json({ error: "OF de otra sucursal" }, { status: 403 });
  }

  const transicion = validarTransicionEstado(existente.estado, estadoNuevo, user.rol);
  if (!transicion.permitida) {
    return Response.json({ error: transicion.motivo }, { status: 409 });
  }

  // Block FINALIZADA when there are active marcajes
  if (estadoNuevo === "FINALIZADA") {
    const marcajeAbierto = await prisma.marcaje.findFirst({
      where: { ordenTrabajoId: id, horaFin: null },
      select: { id: true },
    });
    if (marcajeAbierto) {
      return Response.json(
        { error: "No se puede finalizar: hay marcajes activos en la OF" },
        { status: 409 }
      );
    }
  }

  const ordenTrabajo = await prisma.ordenTrabajo.update({
    where: { id },
    data: { estado: estadoNuevo },
    select: {
      id: true,
      numero: true,
      estado: true,
      prioridad: true,
      updatedAt: true,
    },
  });

  void registrarAuditoria({
    usuarioId: user.id,
    accion: "CAMBIAR_ESTADO_OF",
    entidad: "OrdenTrabajo",
    entidadId: id,
    datosAnteriores: { estado: existente.estado },
    datosNuevos: { estado: estadoNuevo },
    ip: getClientIp(request),
  });

  // ── Emisión Socket.io ─────────────────────────────────────────────────
  socketEmit.ofEstadoCambio(existente.sucursalId, {
    ofId: id,
    ofNumero: existente.numero,
    estadoAnterior: existente.estado,
    estadoNuevo,
  });

  return Response.json({ ordenTrabajo });
}
