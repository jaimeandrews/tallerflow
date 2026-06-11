-- CreateIndex
CREATE INDEX "alertas_sucursal_id_resuelta_idx" ON "alertas"("sucursal_id", "resuelta");

-- CreateIndex
CREATE INDEX "asignaciones_tecnicos_usuario_id_activa_idx" ON "asignaciones_tecnicos"("usuario_id", "activa");

-- CreateIndex
CREATE INDEX "log_auditoria_usuario_id_created_at_idx" ON "log_auditoria"("usuario_id", "created_at");

-- CreateIndex
CREATE INDEX "log_auditoria_created_at_idx" ON "log_auditoria"("created_at");

-- CreateIndex
CREATE INDEX "marcajes_actividad_id_idx" ON "marcajes"("actividad_id");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_sucursal_id_estado_idx" ON "ordenes_trabajo"("sucursal_id", "estado");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_sucursal_id_critica_idx" ON "ordenes_trabajo"("sucursal_id", "critica");
