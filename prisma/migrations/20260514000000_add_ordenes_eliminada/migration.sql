-- AlterTable
ALTER TABLE "ordenes_trabajo" ADD COLUMN "eliminada" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ordenes_trabajo_estado_idx" ON "ordenes_trabajo"("estado");

-- CreateIndex
CREATE INDEX "ordenes_trabajo_eliminada_idx" ON "ordenes_trabajo"("eliminada");
