-- CreateEnum
CREATE TYPE "EstadoLiquidacion" AS ENUM ('vigente', 'anulada');

-- CreateEnum
CREATE TYPE "MedioDePago" AS ENUM ('transferencia', 'efectivo', 'deposito', 'debito');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('liquidacion_publicada', 'cambio_estado_reclamo', 'reserva_confirmada', 'vencimiento_proximo', 'novedad');

-- CreateEnum
CREATE TYPE "EstadoEnvio" AS ENUM ('pendiente', 'enviada', 'fallida');

-- AlterEnum
ALTER TYPE "TipoTrabajo" ADD VALUE 'documento_expensa';

-- AlterTable
ALTER TABLE "Consorcio" ADD COLUMN     "dia_vencimiento" SMALLINT NOT NULL DEFAULT 10,
ADD COLUMN     "tasa_mora_mensual" DECIMAL(6,4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Liquidacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "total_ordinario" DECIMAL(14,2) NOT NULL,
    "total_extraordinario" DECIMAL(14,2) NOT NULL,
    "total_general" DECIMAL(14,2) NOT NULL,
    "vencimiento" DATE NOT NULL,
    "emitida_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitida_por" UUID NOT NULL,
    "estado" "EstadoLiquidacion" NOT NULL DEFAULT 'vigente',
    "anula_a_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DetalleLiquidacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "liquidacion_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "coeficiente_aplicado" DECIMAL(11,8) NOT NULL,
    "importe_ordinario" DECIMAL(14,2) NOT NULL,
    "importe_extraordinario" DECIMAL(14,2) NOT NULL,
    "deuda_anterior" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interes_mora" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "saldo_a_favor_aplicado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "ajuste_redondeo" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_unidad" DECIMAL(14,2) NOT NULL,
    "clave_documento" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DetalleLiquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteresLiquidado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "detalle_id" UUID NOT NULL,
    "liquidacion_origen_id" UUID NOT NULL,
    "capital" DECIMAL(14,2) NOT NULL,
    "tasa_mensual" DECIMAL(6,4) NOT NULL,
    "meses" SMALLINT NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteresLiquidado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "fecha_pago" DATE NOT NULL,
    "importe" DECIMAL(14,2) NOT NULL,
    "medio" "MedioDePago" NOT NULL,
    "referencia" TEXT,
    "saldo_a_favor" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "registrado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoImputacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pago_id" UUID NOT NULL,
    "detalle_liquidacion_id" UUID NOT NULL,
    "importe_imputado" DECIMAL(14,2) NOT NULL,
    "revertida_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagoImputacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "entidad_tipo" TEXT,
    "entidad_id" UUID,
    "enviada_en" TIMESTAMPTZ(6),
    "leida_en" TIMESTAMPTZ(6),
    "estadoEnvio" "EstadoEnvio" NOT NULL DEFAULT 'pendiente',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Liquidacion_consorcio_id_idx" ON "Liquidacion"("consorcio_id");

-- CreateIndex
CREATE INDEX "Liquidacion_periodo_id_idx" ON "Liquidacion"("periodo_id");

-- CreateIndex
CREATE INDEX "DetalleLiquidacion_unidad_id_idx" ON "DetalleLiquidacion"("unidad_id");

-- CreateIndex
CREATE UNIQUE INDEX "DetalleLiquidacion_liquidacion_id_unidad_id_key" ON "DetalleLiquidacion"("liquidacion_id", "unidad_id");

-- CreateIndex
CREATE INDEX "InteresLiquidado_detalle_id_idx" ON "InteresLiquidado"("detalle_id");

-- CreateIndex
CREATE INDEX "Pago_consorcio_id_idx" ON "Pago"("consorcio_id");

-- CreateIndex
CREATE INDEX "Pago_unidad_id_fecha_pago_idx" ON "Pago"("unidad_id", "fecha_pago");

-- CreateIndex
CREATE INDEX "PagoImputacion_pago_id_idx" ON "PagoImputacion"("pago_id");

-- CreateIndex
CREATE INDEX "PagoImputacion_detalle_liquidacion_id_idx" ON "PagoImputacion"("detalle_liquidacion_id");

-- CreateIndex
CREATE INDEX "Notificacion_usuario_id_estadoEnvio_idx" ON "Notificacion"("usuario_id", "estadoEnvio");

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Liquidacion" ADD CONSTRAINT "Liquidacion_anula_a_id_fkey" FOREIGN KEY ("anula_a_id") REFERENCES "Liquidacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleLiquidacion" ADD CONSTRAINT "DetalleLiquidacion_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "Liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DetalleLiquidacion" ADD CONSTRAINT "DetalleLiquidacion_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteresLiquidado" ADD CONSTRAINT "InteresLiquidado_detalle_id_fkey" FOREIGN KEY ("detalle_id") REFERENCES "DetalleLiquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteresLiquidado" ADD CONSTRAINT "InteresLiquidado_liquidacion_origen_id_fkey" FOREIGN KEY ("liquidacion_origen_id") REFERENCES "Liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoImputacion" ADD CONSTRAINT "PagoImputacion_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoImputacion" ADD CONSTRAINT "PagoImputacion_detalle_liquidacion_id_fkey" FOREIGN KEY ("detalle_liquidacion_id") REFERENCES "DetalleLiquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Lo que el mapeador no expresa, escrito a mano (T011, T012).
-- ============================================================================

-- El dia de vencimiento no puede pasar de 28: el 30 no existe en febrero, y
-- resolver esa excepcion en cada calculo es la clase de defecto que aparece una
-- vez al año y rompe en produccion (FR-002b).
ALTER TABLE "Consorcio"
  ADD CONSTRAINT "consorcio_dia_vencimiento_valido"
  CHECK ("dia_vencimiento" BETWEEN 1 AND 28);

-- La tasa de mora no puede ser negativa: una mora negativa es un descuento por
-- pagar tarde.
ALTER TABLE "Consorcio"
  ADD CONSTRAINT "consorcio_tasa_mora_no_negativa"
  CHECK ("tasa_mora_mensual" >= 0);

-- El candado contra la emision doble (regla RN-06, FR-003b, SC-011).
--
-- **Parcial a proposito.** Un unico a secas sobre periodo_id impediria para
-- siempre reemitir despues de anular, que es exactamente lo que la regla RN-06
-- manda hacer para corregir. Lo que no puede haber es dos liquidaciones
-- **vigentes** del mismo periodo.
--
-- Lo impone la base y no el codigo: dos transacciones en paralelo no pueden
-- ganar las dos, sin que nadie tenga que acordarse de verificar antes.
CREATE UNIQUE INDEX "liquidacion_una_vigente_por_periodo"
  ON "Liquidacion" ("periodo_id")
  WHERE "estado" = 'vigente';

-- Los meses de atraso no pueden ser negativos ni el interes tampoco: si alguna
-- vez lo son, es un defecto de calculo y conviene que la base lo diga.
ALTER TABLE "InteresLiquidado"
  ADD CONSTRAINT "interes_meses_no_negativos" CHECK ("meses" >= 0),
  ADD CONSTRAINT "interes_importe_no_negativo" CHECK ("importe" >= 0);

-- Un pago no puede ser cero ni negativo, y su saldo a favor no puede superarlo.
ALTER TABLE "Pago"
  ADD CONSTRAINT "pago_importe_positivo" CHECK ("importe" > 0),
  ADD CONSTRAINT "pago_saldo_a_favor_en_rango"
  CHECK ("saldo_a_favor" >= 0 AND "saldo_a_favor" <= "importe");

-- Una imputacion de cero o negativa no es una imputacion.
ALTER TABLE "PagoImputacion"
  ADD CONSTRAINT "imputacion_importe_positivo" CHECK ("importe_imputado" > 0);

-- Auditoria de las cinco tablas economicas de la etapa (regla RN-15, SC-012).
-- `Notificacion` queda afuera: no es economica, igual que TrabajoPendiente.
CREATE TRIGGER auditar_liquidacion
AFTER INSERT OR UPDATE OR DELETE ON "Liquidacion"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_detalle_liquidacion
AFTER INSERT OR UPDATE OR DELETE ON "DetalleLiquidacion"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_interes_liquidado
AFTER INSERT OR UPDATE OR DELETE ON "InteresLiquidado"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_pago
AFTER INSERT OR UPDATE OR DELETE ON "Pago"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_pago_imputacion
AFTER INSERT OR UPDATE OR DELETE ON "PagoImputacion"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
