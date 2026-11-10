-- Cargos por arrastre (FR-024, RF-08, decision 2026-11-10): la liquidacion que
-- arrastra una deuda vencida en firme le carga el recargo mas alto del
-- escalonado (una sola vez) y la mora (una vez por liquidacion). Las dos van a
-- `InteresLiquidado`, distinguidas por `tipo`: asi se sabe si el recargo de un
-- origen ya se cobro y el documento rotula cada linea. Lo anterior era mora.
CREATE TYPE "TipoCargo" AS ENUM ('mora', 'recargo');

ALTER TABLE "InteresLiquidado" ADD COLUMN "tipo" "TipoCargo" NOT NULL DEFAULT 'mora';
