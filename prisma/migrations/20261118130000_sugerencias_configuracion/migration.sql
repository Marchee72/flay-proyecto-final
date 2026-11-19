-- Sugerencias de configuracion leidas de la documentacion (RF-19, RN-14): quedan
-- pendientes hasta que el administrador las aplica o descarta.

-- CreateEnum
CREATE TYPE "TipoSugerencia" AS ENUM ('espacio_nuevo', 'espacio_cambio', 'vencimientos', 'asambleas', 'instrucciones_pago');

-- CreateEnum
CREATE TYPE "EstadoSugerencia" AS ENUM ('pendiente', 'aplicada', 'descartada');

-- AlterEnum
ALTER TYPE "TipoTrabajo" ADD VALUE 'sugerir_configuracion';

-- CreateTable
CREATE TABLE "SugerenciaConfiguracion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "tipo" "TipoSugerencia" NOT NULL,
    "datos" JSONB NOT NULL,
    "cita" TEXT NOT NULL,
    "estado" "EstadoSugerencia" NOT NULL DEFAULT 'pendiente',
    "resuelta_por" UUID,
    "resuelta_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SugerenciaConfiguracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SugerenciaConfiguracion_consorcio_id_documento_id_estado_idx" ON "SugerenciaConfiguracion"("consorcio_id", "documento_id", "estado");

-- AddForeignKey
ALTER TABLE "SugerenciaConfiguracion" ADD CONSTRAINT "SugerenciaConfiguracion_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SugerenciaConfiguracion" ADD CONSTRAINT "SugerenciaConfiguracion_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "DocumentoConsorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Auditoria (RN-15): como ExtraccionComprobante, la propuesta de la asistencia y
-- quien la aplico o descarto quedan en la bitacora.
CREATE TRIGGER auditar_sugerencia_configuracion
AFTER INSERT OR UPDATE OR DELETE ON "SugerenciaConfiguracion"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
