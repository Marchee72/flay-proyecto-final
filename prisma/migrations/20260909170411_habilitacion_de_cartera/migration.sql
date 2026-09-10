-- CreateTable
CREATE TABLE "HabilitacionCartera" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabilitacionCartera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabilitacionCartera_usuario_id_idx" ON "HabilitacionCartera"("usuario_id");

-- AddForeignKey
ALTER TABLE "HabilitacionCartera" ADD CONSTRAINT "HabilitacionCartera_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
