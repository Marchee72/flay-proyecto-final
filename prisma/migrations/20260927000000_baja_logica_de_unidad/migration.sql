-- FR-011: el padron se edita despues del alta, y una unidad se puede dar de
-- baja. La baja es logica: borrar la fila romperia la suma historica que
-- verifica fn_verificar_suma_historica y la historia economica de la unidad.
-- La dada de baja queda con coeficiente cero, asi la suma del padron vigente
-- sigue siendo exactamente 100.
ALTER TABLE "Unidad" ADD COLUMN "baja_desde" DATE;

-- Dada de baja, el coeficiente es cero; con coeficiente, no esta dada de baja.
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_baja_sin_coeficiente"
  CHECK (baja_desde IS NULL OR coeficiente = 0);
