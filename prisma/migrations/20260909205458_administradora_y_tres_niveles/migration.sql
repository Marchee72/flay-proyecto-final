-- AlterTable
ALTER TABLE "Consorcio" ADD COLUMN     "administradora_id" UUID NOT NULL;

-- CreateTable
CREATE TABLE "Administradora" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "razon_social" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Administradora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabilitacionAdministradora" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "administradora_id" UUID NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabilitacionAdministradora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Administradora_cuit_key" ON "Administradora"("cuit");

-- CreateIndex
CREATE UNIQUE INDEX "HabilitacionAdministradora_usuario_id_administradora_id_key" ON "HabilitacionAdministradora"("usuario_id", "administradora_id");

-- CreateIndex
CREATE INDEX "Consorcio_administradora_id_idx" ON "Consorcio"("administradora_id");

-- CreateIndex
CREATE UNIQUE INDEX "Habilitacion_usuario_id_consorcio_id_rol_key" ON "Habilitacion"("usuario_id", "consorcio_id", "rol");

-- AddForeignKey
ALTER TABLE "Consorcio" ADD CONSTRAINT "Consorcio_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "Administradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabilitacionAdministradora" ADD CONSTRAINT "HabilitacionAdministradora_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabilitacionAdministradora" ADD CONSTRAINT "HabilitacionAdministradora_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "Administradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

