-- CreateEnum
CREATE TYPE "TipoTrabajo" AS ENUM ('invitacion', 'confirmacion_subida');

-- CreateEnum
CREATE TYPE "EstadoTrabajo" AS ENUM ('pendiente', 'despachado', 'agotado');

-- CreateTable
CREATE TABLE "Consorcio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "localidad" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consorcio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrabajoPendiente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" "TipoTrabajo" NOT NULL,
    "carga" JSONB NOT NULL,
    "estado" "EstadoTrabajo" NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proximo_intento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_error" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrabajoPendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consorcio_cuit_key" ON "Consorcio"("cuit");

-- CreateIndex
CREATE INDEX "TrabajoPendiente_estado_proximo_intento_idx" ON "TrabajoPendiente"("estado", "proximo_intento");
