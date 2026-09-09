-- DropForeignKey
ALTER TABLE "HabilitacionCartera" DROP CONSTRAINT "HabilitacionCartera_usuario_id_fkey";

-- DropTable
DROP TABLE "HabilitacionCartera";

-- CreateTable
CREATE TABLE "HabilitacionPlataforma" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabilitacionPlataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabilitacionPlataforma_usuario_id_idx" ON "HabilitacionPlataforma"("usuario_id");

-- AddForeignKey
ALTER TABLE "HabilitacionPlataforma" ADD CONSTRAINT "HabilitacionPlataforma_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

