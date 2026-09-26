-- RF-18: la novedad rige entre dos fechas y despues deja de mostrarse; va a
-- todo el consorcio, a una unidad o a una division; y cada uno puede
-- descartarla para no verla mas.

-- CreateEnum
CREATE TYPE "AlcanceNovedad" AS ENUM ('general', 'unidad', 'division');

-- AlterTable: las fechas nacen nulas para rellenar las que ya existen.
ALTER TABLE "Novedad" ADD COLUMN     "alcance" "AlcanceNovedad" NOT NULL DEFAULT 'general',
ADD COLUMN     "division" VARCHAR(4),
ADD COLUMN     "unidad_id" UUID,
ADD COLUMN     "vigente_desde" DATE,
ADD COLUMN     "vigente_hasta" DATE;

-- Las publicadas antes de esto rigen treinta dias desde su publicacion: las
-- viejas dejan de aparecer, que es justamente lo que se pidio.
UPDATE "Novedad"
SET vigente_desde = (publicada_en AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    vigente_hasta = (publicada_en AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 30;

ALTER TABLE "Novedad" ALTER COLUMN "vigente_desde" SET NOT NULL,
ALTER COLUMN "vigente_hasta" SET NOT NULL;

ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_vigencia_ordenada"
  CHECK (vigente_hasta >= vigente_desde);

-- Cada alcance lleva exactamente su destinatario, y ninguno de los otros.
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_alcance_coherente" CHECK (
  (alcance = 'general' AND unidad_id IS NULL AND division IS NULL) OR
  (alcance = 'unidad' AND unidad_id IS NOT NULL AND division IS NULL) OR
  (alcance = 'division' AND unidad_id IS NULL AND division IS NOT NULL)
);

-- CreateTable
CREATE TABLE "NovedadDescartada" (
    "novedad_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "descartada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NovedadDescartada_pkey" PRIMARY KEY ("novedad_id","usuario_id")
);

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NovedadDescartada" ADD CONSTRAINT "NovedadDescartada_novedad_id_fkey" FOREIGN KEY ("novedad_id") REFERENCES "Novedad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
