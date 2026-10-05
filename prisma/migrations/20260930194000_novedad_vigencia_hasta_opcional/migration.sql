-- AlterTable
ALTER TABLE "Novedad" ALTER COLUMN "vigente_hasta" DROP NOT NULL;

-- Actualizar restricción de vigencia para permitir vigente_hasta nulo (sin vencimiento)
ALTER TABLE "Novedad" DROP CONSTRAINT IF EXISTS "Novedad_vigencia_ordenada";
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_vigencia_ordenada"
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde);
