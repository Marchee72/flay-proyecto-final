-- CreateEnum
CREATE TYPE "EstadoIntentoPago" AS ENUM ('iniciado', 'aprobado', 'rechazado', 'vencido');

-- AlterEnum
ALTER TYPE "MedioDePago" ADD VALUE 'mercado_pago';

-- CreateTable
CREATE TABLE "CredencialPagoAdministradora" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "administradora_id" UUID NOT NULL,
    "access_token_cifrado" TEXT NOT NULL,
    "secreto_webhook_cifrado" TEXT NOT NULL,
    "ultimos_cuatro" TEXT NOT NULL,
    "cargado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredencialPagoAdministradora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoDePago" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "detalle_liquidacion_id" UUID NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "estado" "EstadoIntentoPago" NOT NULL DEFAULT 'iniciado',
    "preferencia_id" TEXT,
    "url_pago" TEXT,
    "pago_externo_id" TEXT,
    "pago_id" UUID,
    "iniciado_por" UUID NOT NULL,
    "vence_en" TIMESTAMPTZ(6) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoDePago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredencialPagoAdministradora_administradora_id_key" ON "CredencialPagoAdministradora"("administradora_id");

-- CreateIndex
CREATE UNIQUE INDEX "IntentoDePago_pago_externo_id_key" ON "IntentoDePago"("pago_externo_id");

-- CreateIndex
CREATE UNIQUE INDEX "IntentoDePago_pago_id_key" ON "IntentoDePago"("pago_id");

-- CreateIndex
CREATE INDEX "IntentoDePago_consorcio_id_idx" ON "IntentoDePago"("consorcio_id");

-- CreateIndex
CREATE INDEX "IntentoDePago_unidad_id_idx" ON "IntentoDePago"("unidad_id");

-- CreateIndex
CREATE INDEX "IntentoDePago_detalle_liquidacion_id_idx" ON "IntentoDePago"("detalle_liquidacion_id");

-- AddForeignKey
ALTER TABLE "CredencialPagoAdministradora" ADD CONSTRAINT "CredencialPagoAdministradora_administradora_id_fkey" FOREIGN KEY ("administradora_id") REFERENCES "Administradora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoDePago" ADD CONSTRAINT "IntentoDePago_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoDePago" ADD CONSTRAINT "IntentoDePago_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoDePago" ADD CONSTRAINT "IntentoDePago_detalle_liquidacion_id_fkey" FOREIGN KEY ("detalle_liquidacion_id") REFERENCES "DetalleLiquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntentoDePago" ADD CONSTRAINT "IntentoDePago_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "Pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Reglas de integridad y auditoria economica (RN-15, RF-28)
-- ============================================================================

-- El importe de un intento de pago debe ser estrictamente positivo
ALTER TABLE "IntentoDePago"
  ADD CONSTRAINT "intento_pago_importe_positivo" CHECK ("importe" > 0);

-- Un solo intento en estado iniciado a la vez por detalle de liquidacion
CREATE UNIQUE INDEX "intento_uno_iniciado_por_detalle"
  ON "IntentoDePago" ("detalle_liquidacion_id")
  WHERE "estado" = 'iniciado';

-- Auditoria de las dos entidades economicas de la integracion (regla RN-15)
CREATE TRIGGER auditar_credencial_pago_administradora
AFTER INSERT OR UPDATE OR DELETE ON "CredencialPagoAdministradora"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_intento_de_pago
AFTER INSERT OR UPDATE OR DELETE ON "IntentoDePago"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

