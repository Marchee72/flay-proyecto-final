-- RF-27 / CU-16: asistente conversacional. Un hilo por usuario y consorcio, con
-- sus turnos. Las tablas nacen con DML para flay_app por los privilegios por
-- defecto del esquema (ver 20260909000000_inicial). No son datos economicos:
-- las escrituras reales las hacen los casos de uso ya auditados por disparadores.

-- CreateEnum
CREATE TYPE "RolMensaje" AS ENUM ('usuario', 'asistente', 'herramienta');

-- CreateEnum
CREATE TYPE "EstadoPropuesta" AS ENUM ('pendiente', 'confirmada', 'descartada');

-- CreateTable
CREATE TABLE "ConversacionAsistente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversacionAsistente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeAsistente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversacion_id" UUID NOT NULL,
    "rol" "RolMensaje" NOT NULL,
    "contenido" TEXT NOT NULL,
    "herramienta" JSONB,
    "propuesta" JSONB,
    "estado_propuesta" "EstadoPropuesta",
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeAsistente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversacionAsistente_consorcio_id_usuario_id_actualizada_e_idx" ON "ConversacionAsistente"("consorcio_id", "usuario_id", "actualizada_en");

-- CreateIndex
CREATE INDEX "MensajeAsistente_conversacion_id_creado_en_idx" ON "MensajeAsistente"("conversacion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "ConversacionAsistente" ADD CONSTRAINT "ConversacionAsistente_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeAsistente" ADD CONSTRAINT "MensajeAsistente_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "ConversacionAsistente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
