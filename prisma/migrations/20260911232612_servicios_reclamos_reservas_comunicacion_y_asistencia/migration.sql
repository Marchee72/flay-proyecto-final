-- CreateEnum
CREATE TYPE "AlcanceReclamo" AS ENUM ('individual', 'general');

-- CreateEnum
CREATE TYPE "Urgencia" AS ENUM ('baja', 'media', 'alta', 'critica');

-- CreateEnum
CREATE TYPE "EstadoReclamo" AS ENUM ('abierto', 'asignado', 'en_curso', 'resuelto', 'cerrado', 'rechazado');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('pendiente', 'confirmada', 'cancelada', 'cumplida', 'rechazada');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('reglamento_copropiedad', 'reglamento_interno', 'acta', 'contrato', 'poliza', 'otro');

-- CreateEnum
CREATE TYPE "EstadoIndexacion" AS ENUM ('pendiente', 'procesando', 'indexado', 'error');

-- CreateEnum
CREATE TYPE "EstadoExtraccion" AS ENUM ('pendiente', 'propuesta', 'confirmada', 'corregida', 'descartada', 'no_disponible');

-- AlterEnum
ALTER TYPE "TipoNotificacion" ADD VALUE 'reserva_rechazada';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoTrabajo" ADD VALUE 'notificacion';
ALTER TYPE "TipoTrabajo" ADD VALUE 'extraccion_comprobante';
ALTER TYPE "TipoTrabajo" ADD VALUE 'triage_reclamo';
ALTER TYPE "TipoTrabajo" ADD VALUE 'indexar_documento';

-- CreateTable
CREATE TABLE "Reclamo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "unidad_id" UUID,
    "creado_por" UUID NOT NULL,
    "titulo" VARCHAR(140) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "alcance" "AlcanceReclamo" NOT NULL DEFAULT 'individual',
    "rubro_id" UUID,
    "urgencia" "Urgencia" NOT NULL DEFAULT 'media',
    "estado" "EstadoReclamo" NOT NULL DEFAULT 'abierto',
    "responsable_id" UUID,
    "proveedor_id" UUID,
    "gasto_id" UUID,
    "fecha_apertura" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resolucion" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reclamo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReclamoHistorial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reclamo_id" UUID NOT NULL,
    "estado_anterior" "EstadoReclamo",
    "estado_nuevo" "EstadoReclamo" NOT NULL,
    "comentario" TEXT,
    "usuario_id" UUID NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReclamoHistorial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SugerenciaReclamo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reclamo_id" UUID NOT NULL,
    "rubro_sugerido_id" UUID,
    "urgencia_sugerida" "Urgencia",
    "proveedor_sugerido_id" UUID,
    "horas_estimadas" INTEGER,
    "confianza" DECIMAL(4,3),
    "aceptada" BOOLEAN,
    "procesado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SugerenciaReclamo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspacioComun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "capacidad_maxima" INTEGER,
    "anticipacion_minima_horas" INTEGER NOT NULL DEFAULT 48,
    "anticipacion_maxima_dias" INTEGER NOT NULL DEFAULT 60,
    "duracion_maxima_horas" INTEGER NOT NULL DEFAULT 8,
    "reservas_max_mes_unidad" INTEGER NOT NULL DEFAULT 2,
    "requiere_deposito" BOOLEAN NOT NULL DEFAULT false,
    "importe_deposito" DECIMAL(14,2),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EspacioComun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reserva" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "espacio_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "solicitada_por" UUID NOT NULL,
    "desde" TIMESTAMPTZ(6) NOT NULL,
    "hasta" TIMESTAMPTZ(6) NOT NULL,
    "cantidad_personas" INTEGER,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'confirmada',
    "motivo_rechazo" TEXT,
    "observaciones" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Novedad" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "titulo" VARCHAR(140) NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "publicada_por" UUID NOT NULL,
    "publicada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fijada" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Novedad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoConsorcio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "clave_almacenamiento" VARCHAR(400) NOT NULL,
    "tipo_contenido" TEXT NOT NULL,
    "hash_sha256" CHAR(64),
    "fecha_documento" DATE,
    "visible_consorcistas" BOOLEAN NOT NULL DEFAULT true,
    "estado_indexacion" "EstadoIndexacion" NOT NULL DEFAULT 'pendiente',
    "error_indexacion" TEXT,
    "cargado_por" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoConsorcio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FragmentoDocumento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documento_id" UUID NOT NULL,
    "numero_fragmento" INTEGER NOT NULL,
    "pagina" INTEGER,
    "contenido" TEXT NOT NULL,
    "vector" vector(768),

    CONSTRAINT "FragmentoDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultaDocumental" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "pregunta" TEXT NOT NULL,
    "respuesta" TEXT,
    "fragmentos_citados" JSONB NOT NULL DEFAULT '[]',
    "sin_respaldo" BOOLEAN NOT NULL,
    "util" BOOLEAN,
    "consultado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultaDocumental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraccionComprobante" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "clave_objeto" TEXT NOT NULL,
    "tipo_contenido" TEXT NOT NULL,
    "comprobante_id" UUID,
    "proveedor_detectado" VARCHAR(160),
    "cuit_detectado" VARCHAR(13),
    "fecha_detectada" DATE,
    "importe_detectado" DECIMAL(14,2),
    "rubro_sugerido_id" UUID,
    "confianza" DECIMAL(4,3),
    "confianza_por_campo" JSONB,
    "estado" "EstadoExtraccion" NOT NULL DEFAULT 'pendiente',
    "confirmada_por" UUID,
    "campos_corregidos" JSONB,
    "gasto_id" UUID,
    "cargado_por" UUID NOT NULL,
    "procesado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtraccionComprobante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reclamo_consorcio_id_estado_fecha_apertura_idx" ON "Reclamo"("consorcio_id", "estado", "fecha_apertura");

-- CreateIndex
CREATE INDEX "ReclamoHistorial_reclamo_id_ocurrido_en_idx" ON "ReclamoHistorial"("reclamo_id", "ocurrido_en");

-- CreateIndex
CREATE UNIQUE INDEX "SugerenciaReclamo_reclamo_id_key" ON "SugerenciaReclamo"("reclamo_id");

-- CreateIndex
CREATE UNIQUE INDEX "EspacioComun_consorcio_id_nombre_key" ON "EspacioComun"("consorcio_id", "nombre");

-- CreateIndex
CREATE INDEX "Reserva_consorcio_id_espacio_id_desde_idx" ON "Reserva"("consorcio_id", "espacio_id", "desde");

-- CreateIndex
CREATE INDEX "Reserva_unidad_id_desde_idx" ON "Reserva"("unidad_id", "desde");

-- CreateIndex
CREATE INDEX "Novedad_consorcio_id_fijada_publicada_en_idx" ON "Novedad"("consorcio_id", "fijada", "publicada_en");

-- CreateIndex
CREATE INDEX "DocumentoConsorcio_consorcio_id_tipo_idx" ON "DocumentoConsorcio"("consorcio_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "FragmentoDocumento_documento_id_numero_fragmento_key" ON "FragmentoDocumento"("documento_id", "numero_fragmento");

-- CreateIndex
CREATE INDEX "ConsultaDocumental_consorcio_id_consultado_en_idx" ON "ConsultaDocumental"("consorcio_id", "consultado_en");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraccionComprobante_comprobante_id_key" ON "ExtraccionComprobante"("comprobante_id");

-- CreateIndex
CREATE UNIQUE INDEX "ExtraccionComprobante_gasto_id_key" ON "ExtraccionComprobante"("gasto_id");

-- CreateIndex
CREATE INDEX "ExtraccionComprobante_consorcio_id_estado_idx" ON "ExtraccionComprobante"("consorcio_id", "estado");

-- AddForeignKey
ALTER TABLE "Reclamo" ADD CONSTRAINT "Reclamo_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamo" ADD CONSTRAINT "Reclamo_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamo" ADD CONSTRAINT "Reclamo_rubro_id_fkey" FOREIGN KEY ("rubro_id") REFERENCES "RubroGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamo" ADD CONSTRAINT "Reclamo_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "Proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reclamo" ADD CONSTRAINT "Reclamo_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "Gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReclamoHistorial" ADD CONSTRAINT "ReclamoHistorial_reclamo_id_fkey" FOREIGN KEY ("reclamo_id") REFERENCES "Reclamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SugerenciaReclamo" ADD CONSTRAINT "SugerenciaReclamo_reclamo_id_fkey" FOREIGN KEY ("reclamo_id") REFERENCES "Reclamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspacioComun" ADD CONSTRAINT "EspacioComun_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_espacio_id_fkey" FOREIGN KEY ("espacio_id") REFERENCES "EspacioComun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reserva" ADD CONSTRAINT "Reserva_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novedad" ADD CONSTRAINT "Novedad_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoConsorcio" ADD CONSTRAINT "DocumentoConsorcio_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FragmentoDocumento" ADD CONSTRAINT "FragmentoDocumento_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "DocumentoConsorcio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultaDocumental" ADD CONSTRAINT "ConsultaDocumental_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraccionComprobante" ADD CONSTRAINT "ExtraccionComprobante_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraccionComprobante" ADD CONSTRAINT "ExtraccionComprobante_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraccionComprobante" ADD CONSTRAINT "ExtraccionComprobante_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "Gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraccionComprobante" ADD CONSTRAINT "ExtraccionComprobante_rubro_sugerido_id_fkey" FOREIGN KEY ("rubro_sugerido_id") REFERENCES "RubroGasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Lo que la base impone y Prisma no declara (004-servicios, research R-05,
-- R-08, R-09). Escrito a mano, como el indice parcial de 003.
-- ---------------------------------------------------------------------------

-- Regla RN-11 (§ 7.2): todo estado distinto del inicial tiene responsable.
-- Un UPDATE directo que la salte es rechazado aca, no en la aplicacion (SC-004).
ALTER TABLE "Reclamo"
  ADD CONSTRAINT "reclamo_responsable_fuera_de_abierto"
  CHECK ("estado" = 'abierto' OR "responsable_id" IS NOT NULL);

-- Una reserva termina despues de empezar.
ALTER TABLE "Reserva"
  ADD CONSTRAINT "reserva_rango_valido" CHECK ("desde" < "hasta");

-- Regla RN-10 (§ 7.2): dos reservas confirmadas del mismo espacio no se
-- superponen, tampoco en dos transacciones concurrentes (SC-005). btree_gist
-- esta instalada desde 001 justamente para esto.
ALTER TABLE "Reserva"
  ADD CONSTRAINT "reserva_sin_superposicion"
  EXCLUDE USING gist ("espacio_id" WITH =, tstzrange("desde", "hasta") WITH &&)
  WHERE ("estado" = 'confirmada');

-- Indice vectorial para la busqueda por coseno (RF-20). HNSW admite hasta 2000
-- dimensiones; 768 es lo que el diccionario de datos declara.
CREATE INDEX "FragmentoDocumento_vector_idx"
  ON "FragmentoDocumento" USING hnsw ("vector" vector_cosine_ops);

-- Auditoria de las tres tablas economicas de la etapa (regla RN-15, SC-021).
-- SugerenciaReclamo, Novedad, DocumentoConsorcio, FragmentoDocumento y
-- ConsultaDocumental quedan afuera: no tocan dinero ni un derecho de uso.
CREATE TRIGGER auditar_extraccion_comprobante
AFTER INSERT OR UPDATE OR DELETE ON "ExtraccionComprobante"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_reclamo
AFTER INSERT OR UPDATE OR DELETE ON "Reclamo"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_reserva
AFTER INSERT OR UPDATE OR DELETE ON "Reserva"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
