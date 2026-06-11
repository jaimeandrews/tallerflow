import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const prioridadEnum = z.enum(["CRITICA", "ALTA", "MEDIA", "BAJA"]);
const estadoOFEnum = z.enum([
  "PENDIENTE",
  "EN_PROCESO",
  "PAUSADA",
  "ESPERA_REPUESTO",
  "FINALIZADA",
]);

export const crearOFSchema = z.object({
  numero: z.string().min(1, "El número de OF es requerido").max(50),
  proyecto: z.string().min(1, "El proyecto es requerido").max(200),
  nombre: z.string().min(1, "El nombre es requerido").max(200),
  cliente: z.string().min(1, "El cliente es requerido").max(200),
  equipo: z.string().min(1, "El equipo es requerido").max(200),
  sucursalId: z.uuid("Sucursal inválida"),
  hhEstimadas: z.number().positive("Las HH estimadas deben ser positivas"),
  prioridad: prioridadEnum,
  tecnicosRequeridos: z.number().int().min(1).max(20).optional(),
  slaVencimiento: z.iso.datetime().optional(),
  critica: z.boolean().optional(),
});

export const actualizarOFSchema = z
  .object({
    numero: z.string().min(1).max(50).optional(),
    proyecto: z.string().min(1).max(200).optional(),
    nombre: z.string().min(1).max(200).optional(),
    cliente: z.string().min(1).max(200).optional(),
    equipo: z.string().min(1).max(200).optional(),
    hhEstimadas: z.number().positive().optional(),
    prioridad: prioridadEnum.optional(),
    estado: estadoOFEnum.optional(),
    tecnicosRequeridos: z.number().int().min(1).max(20).optional(),
    slaVencimiento: z.iso.datetime().nullable().optional(),
    critica: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe proporcionar al menos un campo para actualizar",
  });

export const cambiarEstadoOFSchema = z.object({
  estado: estadoOFEnum,
});

export const listarOFQuerySchema = z.object({
  estado: estadoOFEnum.optional(),
  prioridad: prioridadEnum.optional(),
  sucursalId: z.uuid().optional(),
  tecnicoId: z.uuid().optional(),
  busqueda: z.string().min(1).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(20),
  ordenarPor: z
    .enum(["numero", "prioridad", "estado", "hhConsumidas", "slaVencimiento", "createdAt"])
    .default("numero"),
  direccion: z.enum(["asc", "desc"]).default("asc"),
});

export const crearMarcajeSchema = z.object({
  usuarioId: z.uuid(),
  ordenTrabajoId: z.uuid().optional(),
  actividadId: z.uuid(),
  tipo: z.enum(["INICIO", "FIN", "PAUSA", "REANUDACION"]),
  horaInicio: z.iso.datetime(),
  sucursalId: z.uuid(),
  turnoId: z.uuid().optional(),
  dispositivo: z.string().optional(),
  notas: z.string().optional(),
  idOffline: z.uuid().optional(),
  creadoOffline: z.boolean().optional(),
});

export const pinLoginSchema = z.object({
  pin: z
    .string()
    .length(4, "El PIN debe tener exactamente 4 dígitos")
    .regex(/^\d+$/, "El PIN solo debe contener números"),
  sucursalId: z.uuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CrearOFInput = z.infer<typeof crearOFSchema>;
export type ActualizarOFInput = z.infer<typeof actualizarOFSchema>;
export type CambiarEstadoOFInput = z.infer<typeof cambiarEstadoOFSchema>;
export type ListarOFQuery = z.infer<typeof listarOFQuerySchema>;
export type CrearMarcajeInput = z.infer<typeof crearMarcajeSchema>;
export type PinLoginInput = z.infer<typeof pinLoginSchema>;
