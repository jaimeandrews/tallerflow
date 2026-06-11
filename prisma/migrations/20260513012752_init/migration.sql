-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('ADMIN', 'GERENTE_SUCURSAL', 'JEFE_TALLER', 'COORDINADOR', 'TECNICO', 'CONTROL_GESTION');

-- CreateEnum
CREATE TYPE "EstadoOF" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'PAUSADA', 'ESPERA_REPUESTO', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "PrioridadOF" AS ENUM ('CRITICA', 'ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "EstadoTecnico" AS ENUM ('TRABAJANDO', 'PAUSA', 'ALMUERZO', 'DETENIDO', 'DISPONIBLE');

-- CreateEnum
CREATE TYPE "TipoMarcaje" AS ENUM ('INICIO', 'FIN', 'PAUSA', 'REANUDACION');

-- CreateTable
CREATE TABLE "sucursales" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "pin" TEXT,
    "iniciales" VARCHAR(3) NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#006FA0',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "especialidades" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "especialidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_especialidades" (
    "usuario_id" TEXT NOT NULL,
    "especialidad_id" TEXT NOT NULL,

    CONSTRAINT "usuario_especialidades_pkey" PRIMARY KEY ("usuario_id","especialidad_id")
);

-- CreateTable
CREATE TABLE "actividades" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "icono" TEXT,
    "color" TEXT NOT NULL,
    "productiva" BOOLEAN NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "sucursal_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordenes_trabajo" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "proyecto" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "equipo" TEXT NOT NULL,
    "estado" "EstadoOF" NOT NULL DEFAULT 'PENDIENTE',
    "prioridad" "PrioridadOF" NOT NULL DEFAULT 'MEDIA',
    "sucursal_id" TEXT NOT NULL,
    "hh_estimadas" DOUBLE PRECISION NOT NULL,
    "hh_consumidas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sla_vencimiento" TIMESTAMP(3),
    "critica" BOOLEAN NOT NULL DEFAULT false,
    "tecnicos_requeridos" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordenes_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones_tecnicos" (
    "id" TEXT NOT NULL,
    "orden_trabajo_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "hh_planificadas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fecha_asignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marcajes" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "orden_trabajo_id" TEXT,
    "actividad_id" TEXT NOT NULL,
    "tipo" "TipoMarcaje" NOT NULL,
    "hora_inicio" TIMESTAMP(3) NOT NULL,
    "hora_fin" TIMESTAMP(3),
    "duracion_minutos" DOUBLE PRECISION,
    "sucursal_id" TEXT NOT NULL,
    "turno_id" TEXT,
    "dispositivo" TEXT,
    "sincronizado" BOOLEAN NOT NULL DEFAULT true,
    "creado_offline" BOOLEAN NOT NULL DEFAULT false,
    "id_offline" TEXT,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marcajes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuraciones_sla" (
    "id" TEXT NOT NULL,
    "sucursal_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "condicion" TEXT NOT NULL,
    "umbral_minutos" INTEGER NOT NULL,
    "nivel_alerta" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuraciones_sla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas" (
    "id" TEXT NOT NULL,
    "configuracion_sla_id" TEXT,
    "sucursal_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "nivel" TEXT NOT NULL,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,
    "resuelta_por_id" TEXT,
    "resuelta_en" TIMESTAMP(3),
    "datos" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" TEXT,
    "datos_anteriores" TEXT,
    "datos_nuevos" TEXT,
    "ip" TEXT,
    "dispositivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_nombre_key" ON "sucursales"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_codigo_key" ON "sucursales"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_rut_key" ON "usuarios"("rut");

-- CreateIndex
CREATE INDEX "usuarios_sucursal_id_idx" ON "usuarios"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "especialidades_nombre_key" ON "especialidades"("nombre");

-- CreateIndex
CREATE INDEX "actividades_sucursal_id_idx" ON "actividades"("sucursal_id");

-- CreateIndex
CREATE INDEX "turnos_sucursal_id_idx" ON "turnos"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_trabajo_numero_key" ON "ordenes_trabajo"("numero");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_sucursal_id_idx" ON "ordenes_trabajo"("sucursal_id");

-- CreateIndex
CREATE INDEX "asignaciones_tecnicos_usuario_id_idx" ON "asignaciones_tecnicos"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_tecnicos_orden_trabajo_id_usuario_id_key" ON "asignaciones_tecnicos"("orden_trabajo_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "marcajes_id_offline_key" ON "marcajes"("id_offline");

-- CreateIndex
CREATE INDEX "marcajes_usuario_id_hora_inicio_idx" ON "marcajes"("usuario_id", "hora_inicio");

-- CreateIndex
CREATE INDEX "marcajes_orden_trabajo_id_hora_inicio_idx" ON "marcajes"("orden_trabajo_id", "hora_inicio");

-- CreateIndex
CREATE INDEX "marcajes_sucursal_id_hora_inicio_idx" ON "marcajes"("sucursal_id", "hora_inicio");

-- CreateIndex
CREATE INDEX "configuraciones_sla_sucursal_id_idx" ON "configuraciones_sla"("sucursal_id");

-- CreateIndex
CREATE INDEX "alertas_sucursal_id_idx" ON "alertas"("sucursal_id");

-- CreateIndex
CREATE INDEX "log_auditoria_usuario_id_idx" ON "log_auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "log_auditoria_entidad_entidad_id_idx" ON "log_auditoria"("entidad", "entidad_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_especialidades" ADD CONSTRAINT "usuario_especialidades_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_especialidades" ADD CONSTRAINT "usuario_especialidades_especialidad_id_fkey" FOREIGN KEY ("especialidad_id") REFERENCES "especialidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actividades" ADD CONSTRAINT "actividades_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordenes_trabajo" ADD CONSTRAINT "ordenes_trabajo_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "ordenes_trabajo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_tecnicos" ADD CONSTRAINT "asignaciones_tecnicos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcajes" ADD CONSTRAINT "marcajes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcajes" ADD CONSTRAINT "marcajes_orden_trabajo_id_fkey" FOREIGN KEY ("orden_trabajo_id") REFERENCES "ordenes_trabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcajes" ADD CONSTRAINT "marcajes_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "actividades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcajes" ADD CONSTRAINT "marcajes_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marcajes" ADD CONSTRAINT "marcajes_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turnos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones_sla" ADD CONSTRAINT "configuraciones_sla_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_configuracion_sla_id_fkey" FOREIGN KEY ("configuracion_sla_id") REFERENCES "configuraciones_sla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_resuelta_por_id_fkey" FOREIGN KEY ("resuelta_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
