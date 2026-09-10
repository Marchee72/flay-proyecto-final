-- CreateEnum
CREATE TYPE "Clasificacion" AS ENUM ('ordinario', 'extraordinario');

-- CreateEnum
CREATE TYPE "EstadoPeriodo" AS ENUM ('abierto', 'cerrado', 'liquidado', 'anulado');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('pendiente', 'disponible', 'fallido');

-- CreateTable
CREATE TABLE "RubroGasto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "clasificacion" "Clasificacion" NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RubroGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proveedor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "razon_social" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "rubro_habitual_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Periodo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" "EstadoPeriodo" NOT NULL DEFAULT 'abierto',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Periodo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gasto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "rubro_id" UUID NOT NULL,
    "proveedor_id" UUID,
    "importe" DECIMAL(14,2) NOT NULL,
    "clasificacion" "Clasificacion" NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cargado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gasto_id" UUID NOT NULL,
    "clave_objeto" TEXT NOT NULL,
    "tipo_contenido" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'pendiente',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RubroGasto_nombre_key" ON "RubroGasto"("nombre");

-- CreateIndex
CREATE INDEX "Proveedor_consorcio_id_idx" ON "Proveedor"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "Proveedor_consorcio_id_cuit_key" ON "Proveedor"("consorcio_id", "cuit");

-- CreateIndex
CREATE INDEX "Periodo_consorcio_id_idx" ON "Periodo"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "Periodo_consorcio_id_anio_mes_key" ON "Periodo"("consorcio_id", "anio", "mes");

-- CreateIndex
CREATE INDEX "Gasto_consorcio_id_periodo_id_rubro_id_idx" ON "Gasto"("consorcio_id", "periodo_id", "rubro_id");

-- CreateIndex
CREATE INDEX "Gasto_consorcio_id_fecha_idx" ON "Gasto"("consorcio_id", "fecha");

-- CreateIndex
CREATE INDEX "Comprobante_gasto_id_idx" ON "Comprobante"("gasto_id");

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proveedor" ADD CONSTRAINT "Proveedor_rubro_habitual_id_fkey" FOREIGN KEY ("rubro_habitual_id") REFERENCES "RubroGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Periodo" ADD CONSTRAINT "Periodo_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "Periodo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "RubroGasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gasto" ADD CONSTRAINT "Gasto_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "Gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Auditoria de las tablas economicas de esta historia (RN-15, FR-025).
-- Con estas, las cinco de la etapa quedan enganchadas: Unidad,
-- CoeficienteHistorico, Periodo, Gasto y Comprobante (SC-007).
CREATE TRIGGER auditar_periodo
AFTER INSERT OR UPDATE OR DELETE ON "Periodo"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_gasto
AFTER INSERT OR UPDATE OR DELETE ON "Gasto"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_comprobante
AFTER INSERT OR UPDATE OR DELETE ON "Comprobante"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
