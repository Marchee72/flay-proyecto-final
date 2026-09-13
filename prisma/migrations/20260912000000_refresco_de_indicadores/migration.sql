-- CreateTable
CREATE TABLE "RefrescoIndicadores" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "refrescado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RefrescoIndicadores_pkey" PRIMARY KEY ("id")
);
