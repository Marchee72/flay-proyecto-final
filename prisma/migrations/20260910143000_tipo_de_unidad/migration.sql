-- Tipo de unidad funcional (punto 7 § Unidad): el analisis lo declara desde el
-- principio y la etapa 002 lo construyo sin el. No toca el prorrateo —toda
-- unidad tributa por su coeficiente, sea departamento o cochera— ni el
-- invariante de la suma; da de que hablar donde hoy solo hay una designacion.
CREATE TYPE "TipoUnidad" AS ENUM ('departamento', 'cochera', 'local', 'baulera');

-- Lo ya cargado es departamento: es lo unico que se pudo cargar hasta ahora, y
-- corregir una cochera existente es una edicion, no una adivinanza de la
-- migracion.
ALTER TABLE "Unidad"
  ADD COLUMN "tipo" "TipoUnidad" NOT NULL DEFAULT 'departamento';
