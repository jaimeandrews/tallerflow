import type { Actividad, EstadoTecnico, Marcaje, TipoMarcaje } from "@/generated/prisma";

export function calcularDuracionMinutos(horaInicio: Date, horaFin: Date): number {
  return (horaFin.getTime() - horaInicio.getTime()) / 60000;
}

type MarcajeConActividad = Marcaje & { actividad: Actividad };

export function calcularHHConsumidas(marcajes: MarcajeConActividad[]): {
  productivas: number;
  noProductivas: number;
  total: number;
} {
  let productivas = 0;
  let noProductivas = 0;

  for (const m of marcajes) {
    if (m.duracionMinutos === null) continue;
    const horas = m.duracionMinutos / 60;
    if (m.actividad.productiva) {
      productivas += horas;
    } else {
      noProductivas += horas;
    }
  }

  return { productivas, noProductivas, total: productivas + noProductivas };
}

export function verificarSolapamiento(
  marcajes: Marcaje[],
  nuevo: { horaInicio: Date; horaFin?: Date }
): boolean {
  const nuevoFin = nuevo.horaFin ?? new Date();
  return marcajes.some((m) => {
    const mFin = m.horaFin ?? new Date();
    return nuevo.horaInicio < mFin && nuevoFin > m.horaInicio;
  });
}

export interface MarcajeEstadoInput {
  horaFin: Date | null;
  tipo: TipoMarcaje;
  actividad: { nombre: string; productiva: boolean };
}

export function obtenerEstadoTecnico(ultimoMarcaje: MarcajeEstadoInput | null): EstadoTecnico {
  if (!ultimoMarcaje || ultimoMarcaje.horaFin !== null) return "DISPONIBLE";
  if (ultimoMarcaje.tipo === "PAUSA") return "PAUSA";
  if (ultimoMarcaje.actividad.nombre === "Almuerzo") return "ALMUERZO";
  if (ultimoMarcaje.actividad.nombre === "Espera repuesto") return "DETENIDO";
  if (ultimoMarcaje.actividad.productiva) return "TRABAJANDO";
  return "DISPONIBLE";
}
