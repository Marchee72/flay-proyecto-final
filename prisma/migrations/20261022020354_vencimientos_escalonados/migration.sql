-- CreateTable
CREATE TABLE "TramoVencimiento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "dia_del_mes" SMALLINT NOT NULL,
    "recargo_porcentaje" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TramoVencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VencimientoLiquidacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "liquidacion_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "fecha" DATE NOT NULL,
    "recargo_porcentaje" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VencimientoLiquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TramoVencimiento_consorcio_id_idx" ON "TramoVencimiento"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "TramoVencimiento_consorcio_id_orden_key" ON "TramoVencimiento"("consorcio_id", "orden");

-- CreateIndex
CREATE INDEX "VencimientoLiquidacion_liquidacion_id_idx" ON "VencimientoLiquidacion"("liquidacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "VencimientoLiquidacion_liquidacion_id_orden_key" ON "VencimientoLiquidacion"("liquidacion_id", "orden");

-- AddForeignKey
ALTER TABLE "TramoVencimiento" ADD CONSTRAINT "TramoVencimiento_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VencimientoLiquidacion" ADD CONSTRAINT "VencimientoLiquidacion_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "Liquidacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Auditoria (RN-15): la regla y su snapshot condicionan importes economicos.
CREATE TRIGGER auditar_tramo_vencimiento
AFTER INSERT OR UPDATE OR DELETE ON "TramoVencimiento"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_vencimiento_liquidacion
AFTER INSERT OR UPDATE OR DELETE ON "VencimientoLiquidacion"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
