-- El indice HNSW se declara parcial sobre los fragmentos que ya tienen vector.
-- Es lo correcto (un fragmento sin vector no se busca) y es lo que hace que la
-- deteccion de deriva no lo vea como un indice que el esquema de Prisma
-- "olvido": Prisma no modela indices parciales ni el tipo hnsw, igual que con
-- el indice unico parcial de 003.
DROP INDEX "FragmentoDocumento_vector_idx";

CREATE INDEX "FragmentoDocumento_vector_idx"
  ON "FragmentoDocumento" USING hnsw ("vector" vector_cosine_ops)
  WHERE "vector" IS NOT NULL;
