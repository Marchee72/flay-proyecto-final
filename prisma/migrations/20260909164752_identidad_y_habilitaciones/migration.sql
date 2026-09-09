-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('invitado', 'activo', 'suspendido');

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('administrador', 'consejo', 'consorcista');

-- CreateTable
CREATE TABLE "Persona" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "documento" TEXT,
    "correo" TEXT,
    "telefono" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "persona_id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "clave_derivada" TEXT,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'invitado',
    "bloqueado_hasta" TIMESTAMPTZ(6),
    "invitacion_hash" TEXT,
    "invitacion_vence" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntentoInicioSesion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "correo_probado" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "exitoso" BOOLEAN NOT NULL,
    "momento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntentoInicioSesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habilitacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "consorcio_id" UUID NOT NULL,
    "rol" "Rol" NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Habilitacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Persona_documento_key" ON "Persona"("documento");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_correo_key" ON "Persona"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_persona_id_key" ON "Usuario"("persona_id");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo");

-- CreateIndex
CREATE INDEX "IntentoInicioSesion_correo_probado_momento_idx" ON "IntentoInicioSesion"("correo_probado", "momento");

-- CreateIndex
CREATE INDEX "Habilitacion_usuario_id_consorcio_id_idx" ON "Habilitacion"("usuario_id", "consorcio_id");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habilitacion" ADD CONSTRAINT "Habilitacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
