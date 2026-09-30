-- RF-18: la novedad gana severidad (tine el aviso) y un cuarto alcance, el
-- piso (la planta: 3A, 3B, 3C son «el piso 3»).

-- AlterEnum: comparamos por texto en el CHECK para no usar el valor nuevo del
-- enum dentro de la misma transaccion (Postgres lo prohibe).
ALTER TYPE "AlcanceNovedad" ADD VALUE 'piso';

-- AlterTable
ALTER TABLE "Novedad" ADD COLUMN "severidad" "Urgencia" NOT NULL DEFAULT 'baja',
ADD COLUMN "piso" VARCHAR(4);

-- Cada alcance lleva exactamente su destinatario, y ninguno de los otros.
ALTER TABLE "Novedad" DROP CONSTRAINT "Novedad_alcance_coherente";
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_alcance_coherente" CHECK (
  (alcance::text = 'general'  AND unidad_id IS NULL     AND division IS NULL     AND piso IS NULL) OR
  (alcance::text = 'unidad'   AND unidad_id IS NOT NULL AND division IS NULL     AND piso IS NULL) OR
  (alcance::text = 'division' AND unidad_id IS NULL     AND division IS NOT NULL AND piso IS NULL) OR
  (alcance::text = 'piso'     AND unidad_id IS NULL     AND division IS NULL     AND piso IS NOT NULL)
);
