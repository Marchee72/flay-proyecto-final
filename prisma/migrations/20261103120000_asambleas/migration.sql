-- CreateEnum
CREATE TYPE "ReglaMayoria" AS ENUM ('presentes', 'totalidad');

-- CreateEnum
CREATE TYPE "TipoAsamblea" AS ENUM ('ordinaria', 'extraordinaria');

-- CreateEnum
CREATE TYPE "EstadoAsamblea" AS ENUM ('borrador', 'convocada', 'en_curso', 'finalizada', 'acta_firmada', 'cancelada');

-- CreateEnum
CREATE TYPE "ConvocatoriaAsamblea" AS ENUM ('primera', 'segunda');

-- CreateEnum
CREATE TYPE "ModalidadPunto" AS ENUM ('binaria', 'opcion_multiple');

-- CreateEnum
CREATE TYPE "MayoriaRequerida" AS ENUM ('absoluta', 'dos_tercios', 'unanimidad');

-- CreateEnum
CREATE TYPE "EstadoPunto" AS ENUM ('pendiente', 'abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "ResultadoPunto" AS ENUM ('aprobado', 'rechazado', 'sin_decision');

-- CreateEnum
CREATE TYPE "SentidoVoto" AS ENUM ('positivo', 'negativo', 'abstencion');

-- CreateEnum
CREATE TYPE "OrigenVoto" AS ENUM ('propio', 'carga_manual');

-- CreateEnum
CREATE TYPE "OrigenRegistro" AS ENUM ('en_linea', 'papel');

-- CreateEnum
CREATE TYPE "Representacion" AS ENUM ('propietario', 'apoderado');

-- CreateEnum
CREATE TYPE "EstadoActa" AS ENUM ('en_redaccion', 'a_firmar', 'firmada');

-- CreateEnum
CREATE TYPE "RolFirmante" AS ENUM ('presidente', 'secretario', 'propietario');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoNotificacion" ADD VALUE 'asamblea_convocada';
ALTER TYPE "TipoNotificacion" ADD VALUE 'asamblea_cancelada';
ALTER TYPE "TipoNotificacion" ADD VALUE 'poder_otorgado';
ALTER TYPE "TipoNotificacion" ADD VALUE 'poder_revocado';
ALTER TYPE "TipoNotificacion" ADD VALUE 'decision_provisoria';
ALTER TYPE "TipoNotificacion" ADD VALUE 'acta_a_firmar';
ALTER TYPE "TipoNotificacion" ADD VALUE 'acta_firmada';

-- AlterEnum
ALTER TYPE "TipoTrabajo" ADD VALUE 'correo_directo';

-- AlterTable
ALTER TABLE "Consorcio" ADD COLUMN     "anticipacion_convocatoria_dias" SMALLINT NOT NULL DEFAULT 15,
ADD COLUMN     "regla_mayoria_asamblea" "ReglaMayoria" NOT NULL DEFAULT 'presentes',
ADD COLUMN     "tope_unidades_por_apoderado" SMALLINT NOT NULL DEFAULT 3,
ADD COLUMN     "umbral_expensas_sin_voto" SMALLINT NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "Asamblea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "tipo" "TipoAsamblea" NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL,
    "lugar" VARCHAR(300) NOT NULL,
    "organizador_id" UUID NOT NULL,
    "administracion_invitada" BOOLEAN NOT NULL DEFAULT true,
    "estado" "EstadoAsamblea" NOT NULL DEFAULT 'borrador',
    "convocada_en" TIMESTAMPTZ(6),
    "cancelada_en" TIMESTAMPTZ(6),
    "motivo_cancelacion" TEXT,
    "abierta_en" TIMESTAMPTZ(6),
    "constituida_en" TIMESTAMPTZ(6),
    "finalizada_en" TIMESTAMPTZ(6),
    "convocatoria_que_rige" "ConvocatoriaAsamblea",
    "dirige_id" UUID,
    "presidente_id" UUID,
    "secretario_id" UUID,
    "regla_mayoria" "ReglaMayoria",
    "anticipacion_dias" SMALLINT,
    "tope_apoderado" SMALLINT,
    "umbral_sin_voto" SMALLINT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntoAsamblea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "asamblea_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "descripcion" TEXT,
    "modalidad" "ModalidadPunto" NOT NULL,
    "mayoria" "MayoriaRequerida",
    "estado" "EstadoPunto" NOT NULL DEFAULT 'pendiente',
    "abierto_en" TIMESTAMPTZ(6),
    "cerrado_en" TIMESTAMPTZ(6),
    "resultado" "ResultadoPunto",
    "opcion_ganadora_id" UUID,
    "conteo" JSONB,
    "provisorio" BOOLEAN NOT NULL DEFAULT false,
    "vence_plazo_oposicion" TIMESTAMPTZ(6),
    "resumen" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PuntoAsamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcionPunto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "punto_id" UUID NOT NULL,
    "orden" SMALLINT NOT NULL,
    "texto" VARCHAR(200) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpcionPunto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "asamblea_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "otorgante_id" UUID NOT NULL,
    "apoderado_id" UUID NOT NULL,
    "origen" "OrigenRegistro" NOT NULL,
    "registrado_por_id" UUID NOT NULL,
    "revocado_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Poder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnidadEnAsamblea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "asamblea_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "designacion" VARCHAR(40) NOT NULL,
    "coeficiente" DECIMAL(11,8) NOT NULL,
    "sin_voto" BOOLEAN NOT NULL DEFAULT false,
    "presente" BOOLEAN NOT NULL DEFAULT false,
    "representante_id" UUID,
    "representante_nombre" VARCHAR(200),
    "representacion" "Representacion",
    "acreditado_en" TIMESTAMPTZ(6),
    "acreditado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnidadEnAsamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VotoAsamblea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "punto_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "sentido" "SentidoVoto",
    "opcion_id" UUID,
    "emitido_por_id" UUID NOT NULL,
    "origen" "OrigenVoto" NOT NULL,
    "emitido_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VotoAsamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OposicionDecision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "punto_id" UUID NOT NULL,
    "unidad_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "origen" "OrigenRegistro" NOT NULL,
    "registrado_por_id" UUID NOT NULL,
    "registrada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OposicionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActaAsamblea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "asamblea_id" UUID NOT NULL,
    "estado" "EstadoActa" NOT NULL DEFAULT 'en_redaccion',
    "clave_contenido" VARCHAR(400),
    "hash_contenido" CHAR(64),
    "enviada_a_firmar_en" TIMESTAMPTZ(6),
    "recordatorio_enviado_en" TIMESTAMPTZ(6),
    "documento_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActaAsamblea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmanteActa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "acta_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "rol_en_acta" "RolFirmante" NOT NULL,
    "reemplaza_a" UUID,
    "firmado_en" TIMESTAMPTZ(6),
    "hash_firmado" CHAR(64),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmanteActa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asamblea_consorcio_id_fecha_hora_idx" ON "Asamblea"("consorcio_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "PuntoAsamblea_consorcio_id_idx" ON "PuntoAsamblea"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "PuntoAsamblea_asamblea_id_orden_key" ON "PuntoAsamblea"("asamblea_id", "orden");

-- CreateIndex
CREATE INDEX "OpcionPunto_consorcio_id_idx" ON "OpcionPunto"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "OpcionPunto_punto_id_orden_key" ON "OpcionPunto"("punto_id", "orden");

-- CreateIndex
CREATE INDEX "Poder_consorcio_id_idx" ON "Poder"("consorcio_id");

-- CreateIndex
CREATE INDEX "Poder_asamblea_id_apoderado_id_idx" ON "Poder"("asamblea_id", "apoderado_id");

-- CreateIndex
CREATE INDEX "UnidadEnAsamblea_consorcio_id_idx" ON "UnidadEnAsamblea"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadEnAsamblea_asamblea_id_unidad_id_key" ON "UnidadEnAsamblea"("asamblea_id", "unidad_id");

-- CreateIndex
CREATE INDEX "VotoAsamblea_consorcio_id_idx" ON "VotoAsamblea"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "VotoAsamblea_punto_id_unidad_id_key" ON "VotoAsamblea"("punto_id", "unidad_id");

-- CreateIndex
CREATE INDEX "OposicionDecision_consorcio_id_idx" ON "OposicionDecision"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "OposicionDecision_punto_id_unidad_id_key" ON "OposicionDecision"("punto_id", "unidad_id");

-- CreateIndex
CREATE UNIQUE INDEX "ActaAsamblea_asamblea_id_key" ON "ActaAsamblea"("asamblea_id");

-- CreateIndex
CREATE INDEX "ActaAsamblea_consorcio_id_estado_idx" ON "ActaAsamblea"("consorcio_id", "estado");

-- CreateIndex
CREATE INDEX "FirmanteActa_consorcio_id_idx" ON "FirmanteActa"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "FirmanteActa_acta_id_usuario_id_key" ON "FirmanteActa"("acta_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "Asamblea" ADD CONSTRAINT "Asamblea_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntoAsamblea" ADD CONSTRAINT "PuntoAsamblea_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntoAsamblea" ADD CONSTRAINT "PuntoAsamblea_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionPunto" ADD CONSTRAINT "OpcionPunto_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionPunto" ADD CONSTRAINT "OpcionPunto_punto_id_fkey" FOREIGN KEY ("punto_id") REFERENCES "PuntoAsamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poder" ADD CONSTRAINT "Poder_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poder" ADD CONSTRAINT "Poder_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poder" ADD CONSTRAINT "Poder_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadEnAsamblea" ADD CONSTRAINT "UnidadEnAsamblea_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadEnAsamblea" ADD CONSTRAINT "UnidadEnAsamblea_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnidadEnAsamblea" ADD CONSTRAINT "UnidadEnAsamblea_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotoAsamblea" ADD CONSTRAINT "VotoAsamblea_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotoAsamblea" ADD CONSTRAINT "VotoAsamblea_punto_id_fkey" FOREIGN KEY ("punto_id") REFERENCES "PuntoAsamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotoAsamblea" ADD CONSTRAINT "VotoAsamblea_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VotoAsamblea" ADD CONSTRAINT "VotoAsamblea_opcion_id_fkey" FOREIGN KEY ("opcion_id") REFERENCES "OpcionPunto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OposicionDecision" ADD CONSTRAINT "OposicionDecision_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OposicionDecision" ADD CONSTRAINT "OposicionDecision_punto_id_fkey" FOREIGN KEY ("punto_id") REFERENCES "PuntoAsamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OposicionDecision" ADD CONSTRAINT "OposicionDecision_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActaAsamblea" ADD CONSTRAINT "ActaAsamblea_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActaAsamblea" ADD CONSTRAINT "ActaAsamblea_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmanteActa" ADD CONSTRAINT "FirmanteActa_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmanteActa" ADD CONSTRAINT "FirmanteActa_acta_id_fkey" FOREIGN KEY ("acta_id") REFERENCES "ActaAsamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ===========================================================================
-- 016 asambleas: lo que la base garantiza por su cuenta (research R-02).
-- Los mensajes llevan el prefijo «FLAY:» y van en castellano para el usuario:
-- la aplicacion los extrae y los muestra tal cual (RNF-10).
--
-- Borrar: ningun hijo se borra mientras su padre exista; caen en cascada al
-- borrar la asamblea (que solo se ofrece en borrador, y que la limpieza de
-- pruebas usa). Cada borrado queda en la bitacora por fn_auditar.
-- ===========================================================================

-- Restricciones declarativas -------------------------------------------------

ALTER TABLE "Consorcio"
  ADD CONSTRAINT "Consorcio_anticipacion_convocatoria_check" CHECK (anticipacion_convocatoria_dias BETWEEN 1 AND 60),
  ADD CONSTRAINT "Consorcio_tope_apoderado_check" CHECK (tope_unidades_por_apoderado BETWEEN 1 AND 10),
  ADD CONSTRAINT "Consorcio_umbral_sin_voto_check" CHECK (umbral_expensas_sin_voto BETWEEN 0 AND 24);

ALTER TABLE "PuntoAsamblea"
  ADD CONSTRAINT "PuntoAsamblea_mayoria_segun_modalidad_check" CHECK (
    (modalidad = 'binaria' AND mayoria IS NOT NULL) OR (modalidad = 'opcion_multiple' AND mayoria IS NULL)
  );

ALTER TABLE "VotoAsamblea"
  ADD CONSTRAINT "VotoAsamblea_sentido_u_opcion_check" CHECK ((sentido IS NULL) <> (opcion_id IS NULL));

-- A lo sumo un punto abierto por asamblea.
CREATE UNIQUE INDEX "PuntoAsamblea_un_abierto_por_asamblea" ON "PuntoAsamblea"(asamblea_id) WHERE estado = 'abierto';

-- A lo sumo un poder vigente por unidad y asamblea.
CREATE UNIQUE INDEX "Poder_vigente_por_unidad" ON "Poder"(asamblea_id, unidad_id) WHERE revocado_en IS NULL;

-- Asamblea: transiciones sin retroceso y datos fijos desde la convocatoria ----

CREATE OR REPLACE FUNCTION fn_asamblea_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
       (OLD.estado = 'borrador'   AND NEW.estado = 'convocada')
    OR (OLD.estado = 'convocada'  AND NEW.estado IN ('en_curso', 'cancelada'))
    OR (OLD.estado = 'en_curso'   AND NEW.estado = 'finalizada' AND OLD.constituida_en IS NOT NULL)
    OR (OLD.estado = 'en_curso'   AND NEW.estado = 'cancelada'  AND OLD.constituida_en IS NULL)
    OR (OLD.estado = 'finalizada' AND NEW.estado = 'acta_firmada')
  ) THEN
    RAISE EXCEPTION 'FLAY: La asamblea no puede pasar de % a %.', OLD.estado, NEW.estado;
  END IF;

  IF OLD.estado <> 'borrador' AND (
       NEW.tipo IS DISTINCT FROM OLD.tipo
    OR NEW.titulo IS DISTINCT FROM OLD.titulo
    OR NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora
    OR NEW.lugar IS DISTINCT FROM OLD.lugar
    OR NEW.organizador_id IS DISTINCT FROM OLD.organizador_id
    OR NEW.administracion_invitada IS DISTINCT FROM OLD.administracion_invitada
    OR NEW.convocada_en IS DISTINCT FROM OLD.convocada_en
    OR NEW.regla_mayoria IS DISTINCT FROM OLD.regla_mayoria
    OR NEW.anticipacion_dias IS DISTINCT FROM OLD.anticipacion_dias
    OR NEW.tope_apoderado IS DISTINCT FROM OLD.tope_apoderado
    OR NEW.umbral_sin_voto IS DISTINCT FROM OLD.umbral_sin_voto
  ) THEN
    RAISE EXCEPTION 'FLAY: Una asamblea convocada no cambia sus datos ni su orden del día. Para reprogramarla, cancelala y convocá otra.';
  END IF;

  IF OLD.constituida_en IS NOT NULL AND (
       NEW.presidente_id IS DISTINCT FROM OLD.presidente_id
    OR NEW.secretario_id IS DISTINCT FROM OLD.secretario_id
    OR NEW.constituida_en IS DISTINCT FROM OLD.constituida_en
    OR NEW.convocatoria_que_rige IS DISTINCT FROM OLD.convocatoria_que_rige
  ) THEN
    RAISE EXCEPTION 'FLAY: Las autoridades y la convocatoria quedan fijas al constituir la asamblea.';
  END IF;

  IF OLD.estado IN ('finalizada', 'acta_firmada', 'cancelada') AND (
       NEW.dirige_id IS DISTINCT FROM OLD.dirige_id
    OR NEW.abierta_en IS DISTINCT FROM OLD.abierta_en
    OR NEW.finalizada_en IS DISTINCT FROM OLD.finalizada_en
    OR NEW.cancelada_en IS DISTINCT FROM OLD.cancelada_en
    OR NEW.motivo_cancelacion IS DISTINCT FROM OLD.motivo_cancelacion
  ) THEN
    RAISE EXCEPTION 'FLAY: Una asamblea cerrada no se modifica.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER asamblea_reglas BEFORE UPDATE ON "Asamblea"
FOR EACH ROW EXECUTE FUNCTION fn_asamblea_reglas();

-- Punto del orden del dia -----------------------------------------------------

CREATE OR REPLACE FUNCTION fn_punto_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_estado "EstadoAsamblea";
  v_acta   "EstadoActa";
  v_fila   "PuntoAsamblea";
BEGIN
  v_fila := COALESCE(NEW, OLD);
  SELECT a.estado INTO v_estado FROM "Asamblea" a WHERE a.id = v_fila.asamblea_id;

  IF TG_OP = 'DELETE' THEN
    IF v_estado IS NOT NULL AND v_estado <> 'borrador' THEN
      RAISE EXCEPTION 'FLAY: Una asamblea convocada no cambia su orden del día.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_estado <> 'borrador' THEN
      RAISE EXCEPTION 'FLAY: Una asamblea convocada no cambia su orden del día.';
    END IF;
    RETURN NEW;
  END IF;

  IF v_estado = 'borrador' THEN
    RETURN NEW;
  END IF;

  IF NEW.titulo IS DISTINCT FROM OLD.titulo
    OR NEW.descripcion IS DISTINCT FROM OLD.descripcion
    OR NEW.modalidad IS DISTINCT FROM OLD.modalidad
    OR NEW.mayoria IS DISTINCT FROM OLD.mayoria
    OR NEW.orden IS DISTINCT FROM OLD.orden
    OR NEW.asamblea_id IS DISTINCT FROM OLD.asamblea_id THEN
    RAISE EXCEPTION 'FLAY: Una asamblea convocada no cambia su orden del día.';
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado THEN
    IF v_estado <> 'en_curso' OR NOT (
         (OLD.estado = 'pendiente' AND NEW.estado = 'abierto')
      OR (OLD.estado = 'abierto'   AND NEW.estado = 'cerrado')
    ) THEN
      RAISE EXCEPTION 'FLAY: El punto no puede pasar de % a %.', OLD.estado, NEW.estado;
    END IF;
  END IF;

  -- El resultado se escribe una sola vez, en el UPDATE que cierra el punto.
  IF NOT (OLD.estado = 'abierto' AND NEW.estado = 'cerrado') AND (
       NEW.resultado IS DISTINCT FROM OLD.resultado
    OR NEW.opcion_ganadora_id IS DISTINCT FROM OLD.opcion_ganadora_id
    OR NEW.conteo IS DISTINCT FROM OLD.conteo
    OR NEW.provisorio IS DISTINCT FROM OLD.provisorio
    OR NEW.vence_plazo_oposicion IS DISTINCT FROM OLD.vence_plazo_oposicion
    OR NEW.cerrado_en IS DISTINCT FROM OLD.cerrado_en
  ) THEN
    RAISE EXCEPTION 'FLAY: El resultado de un punto se fija al cerrarlo y no cambia.';
  END IF;

  IF NOT (OLD.estado = 'pendiente' AND NEW.estado = 'abierto')
    AND NEW.abierto_en IS DISTINCT FROM OLD.abierto_en THEN
    RAISE EXCEPTION 'FLAY: El punto no puede pasar de % a %.', OLD.estado, NEW.estado;
  END IF;

  IF NEW.resumen IS DISTINCT FROM OLD.resumen THEN
    SELECT ac.estado INTO v_acta FROM "ActaAsamblea" ac WHERE ac.asamblea_id = NEW.asamblea_id;
    IF v_acta IS DISTINCT FROM 'en_redaccion' THEN
      RAISE EXCEPTION 'FLAY: El resumen se redacta con el acta en redacción; enviada a firmar, ya no cambia.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER punto_reglas BEFORE INSERT OR UPDATE OR DELETE ON "PuntoAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_punto_reglas();

-- Opciones de un punto: solo en borrador --------------------------------------

CREATE OR REPLACE FUNCTION fn_opcion_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_estado "EstadoAsamblea";
BEGIN
  SELECT a.estado INTO v_estado
  FROM "PuntoAsamblea" p JOIN "Asamblea" a ON a.id = p.asamblea_id
  WHERE p.id = (COALESCE(NEW, OLD)).punto_id;

  IF v_estado IS NOT NULL AND v_estado <> 'borrador' THEN
    RAISE EXCEPTION 'FLAY: Una asamblea convocada no cambia su orden del día.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER opcion_reglas BEFORE INSERT OR UPDATE OR DELETE ON "OpcionPunto"
FOR EACH ROW EXECUTE FUNCTION fn_opcion_reglas();

-- Poder: se otorga y se revoca con la asamblea convocada ----------------------

CREATE OR REPLACE FUNCTION fn_poder_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_estado "EstadoAsamblea";
BEGIN
  SELECT a.estado INTO v_estado FROM "Asamblea" a WHERE a.id = (COALESCE(NEW, OLD)).asamblea_id;

  IF TG_OP = 'DELETE' THEN
    IF v_estado IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: Un poder no se borra: se revoca.';
    END IF;
    RETURN OLD;
  END IF;

  IF v_estado <> 'convocada' THEN
    RAISE EXCEPTION 'FLAY: Los poderes se otorgan y se revocan con la asamblea convocada, antes de abrirla.';
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.unidad_id IS DISTINCT FROM OLD.unidad_id
    OR NEW.otorgante_id IS DISTINCT FROM OLD.otorgante_id
    OR NEW.apoderado_id IS DISTINCT FROM OLD.apoderado_id
    OR NEW.origen IS DISTINCT FROM OLD.origen
    OR NEW.registrado_por_id IS DISTINCT FROM OLD.registrado_por_id
    OR OLD.revocado_en IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FLAY: Un poder no se modifica; se revoca y se otorga otro.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER poder_reglas BEFORE INSERT OR UPDATE OR DELETE ON "Poder"
FOR EACH ROW EXECUTE FUNCTION fn_poder_reglas();

-- Padron congelado y asistencia -----------------------------------------------

CREATE OR REPLACE FUNCTION fn_padron_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_estado "EstadoAsamblea";
BEGIN
  SELECT a.estado INTO v_estado FROM "Asamblea" a WHERE a.id = (COALESCE(NEW, OLD)).asamblea_id;

  IF TG_OP = 'DELETE' THEN
    IF v_estado IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: El padrón de una asamblea no se modifica.';
    END IF;
    RETURN OLD;
  END IF;

  IF v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'FLAY: La asistencia se registra con la asamblea en curso.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF NEW.unidad_id IS DISTINCT FROM OLD.unidad_id
    OR NEW.designacion IS DISTINCT FROM OLD.designacion
    OR NEW.coeficiente IS DISTINCT FROM OLD.coeficiente
    OR NEW.sin_voto IS DISTINCT FROM OLD.sin_voto
    OR NEW.asamblea_id IS DISTINCT FROM OLD.asamblea_id THEN
    RAISE EXCEPTION 'FLAY: El padrón de una asamblea se congela al abrirla.';
  END IF;

  IF OLD.presente AND (
       NOT NEW.presente
    OR NEW.representante_id IS DISTINCT FROM OLD.representante_id
    OR NEW.representante_nombre IS DISTINCT FROM OLD.representante_nombre
    OR NEW.representacion IS DISTINCT FROM OLD.representacion
    OR NEW.acreditado_en IS DISTINCT FROM OLD.acreditado_en
    OR NEW.acreditado_por_id IS DISTINCT FROM OLD.acreditado_por_id
  ) THEN
    RAISE EXCEPTION 'FLAY: Esa unidad ya está acreditada.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER padron_reglas BEFORE INSERT OR UPDATE OR DELETE ON "UnidadEnAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_padron_reglas();

-- Voto: se emite y se cambia solo con el punto abierto ------------------------

CREATE OR REPLACE FUNCTION fn_voto_inmutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_punto     "PuntoAsamblea";
  v_asamblea  "EstadoAsamblea";
  v_presente  BOOLEAN;
  v_sin_voto  BOOLEAN;
BEGIN
  SELECT * INTO v_punto FROM "PuntoAsamblea" p WHERE p.id = (COALESCE(NEW, OLD)).punto_id;

  IF TG_OP = 'DELETE' THEN
    IF v_punto.id IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: Un voto emitido no se puede borrar.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.punto_id IS DISTINCT FROM OLD.punto_id
      OR NEW.unidad_id IS DISTINCT FROM OLD.unidad_id
      OR NEW.consorcio_id IS DISTINCT FROM OLD.consorcio_id
    THEN
      RAISE EXCEPTION 'FLAY: Un voto emitido no se puede modificar.';
    END IF;
  END IF;

  SELECT a.estado INTO v_asamblea FROM "Asamblea" a WHERE a.id = v_punto.asamblea_id;
  IF v_asamblea IS DISTINCT FROM 'en_curso' OR v_punto.estado <> 'abierto' THEN
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'FLAY: Un voto emitido no se puede modificar.';
    END IF;
    RAISE EXCEPTION 'FLAY: Ese punto no está en votación.';
  END IF;

  SELECT u.presente, u.sin_voto INTO v_presente, v_sin_voto
  FROM "UnidadEnAsamblea" u
  WHERE u.asamblea_id = v_punto.asamblea_id AND u.unidad_id = NEW.unidad_id;

  IF NOT COALESCE(v_presente, false) THEN
    RAISE EXCEPTION 'FLAY: La unidad no está acreditada como presente.';
  END IF;
  IF v_sin_voto THEN
    RAISE EXCEPTION 'FLAY: La unidad no tiene voto por deuda de expensas.';
  END IF;

  IF v_punto.modalidad = 'binaria' AND NEW.sentido IS NULL
    OR v_punto.modalidad = 'opcion_multiple' AND NEW.opcion_id IS NULL THEN
    RAISE EXCEPTION 'FLAY: El voto no corresponde a las opciones del punto.';
  END IF;
  IF NEW.opcion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "OpcionPunto" o WHERE o.id = NEW.opcion_id AND o.punto_id = NEW.punto_id
  ) THEN
    RAISE EXCEPTION 'FLAY: El voto no corresponde a las opciones del punto.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER voto_inmutable BEFORE INSERT OR UPDATE OR DELETE ON "VotoAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_voto_inmutable();

-- Oposicion: solo de ausentes con voto, dentro del plazo ----------------------

CREATE OR REPLACE FUNCTION fn_oposicion_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_punto    "PuntoAsamblea";
  v_presente BOOLEAN;
  v_sin_voto BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'FLAY: Una oposición registrada no se modifica.';
  END IF;

  SELECT * INTO v_punto FROM "PuntoAsamblea" p WHERE p.id = (COALESCE(NEW, OLD)).punto_id;

  IF TG_OP = 'DELETE' THEN
    IF v_punto.id IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: Una oposición registrada no se borra.';
    END IF;
    RETURN OLD;
  END IF;

  IF NOT v_punto.provisorio OR v_punto.vence_plazo_oposicion IS NULL THEN
    RAISE EXCEPTION 'FLAY: Esa decisión no admite oposición.';
  END IF;
  IF now() > v_punto.vence_plazo_oposicion THEN
    RAISE EXCEPTION 'FLAY: El plazo para oponerse ya venció.';
  END IF;

  SELECT u.presente, u.sin_voto INTO v_presente, v_sin_voto
  FROM "UnidadEnAsamblea" u
  WHERE u.asamblea_id = v_punto.asamblea_id AND u.unidad_id = NEW.unidad_id;

  IF v_presente IS NULL OR v_presente OR v_sin_voto THEN
    RAISE EXCEPTION 'FLAY: Solo puede oponerse el propietario de una unidad ausente con voto.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER oposicion_reglas BEFORE INSERT OR UPDATE OR DELETE ON "OposicionDecision"
FOR EACH ROW EXECUTE FUNCTION fn_oposicion_reglas();

-- Acta ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_acta_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_estado "EstadoAsamblea";
BEGIN
  SELECT a.estado INTO v_estado FROM "Asamblea" a WHERE a.id = (COALESCE(NEW, OLD)).asamblea_id;

  IF TG_OP = 'DELETE' THEN
    IF v_estado IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: Un acta no se borra.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_estado <> 'finalizada' THEN
      RAISE EXCEPTION 'FLAY: El acta nace al finalizar la asamblea.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
       (OLD.estado = 'en_redaccion' AND NEW.estado = 'a_firmar')
    OR (OLD.estado = 'a_firmar'     AND NEW.estado = 'firmada')
  ) THEN
    RAISE EXCEPTION 'FLAY: El acta no puede pasar de % a %.', OLD.estado, NEW.estado;
  END IF;

  IF NOT (OLD.estado = 'en_redaccion' AND NEW.estado = 'a_firmar') AND (
       NEW.clave_contenido IS DISTINCT FROM OLD.clave_contenido
    OR NEW.hash_contenido IS DISTINCT FROM OLD.hash_contenido
    OR NEW.enviada_a_firmar_en IS DISTINCT FROM OLD.enviada_a_firmar_en
  ) THEN
    RAISE EXCEPTION 'FLAY: El contenido del acta enviada a firmar no cambia.';
  END IF;
  IF NEW.estado = 'a_firmar' AND NEW.hash_contenido IS NULL THEN
    RAISE EXCEPTION 'FLAY: El acta se envía a firmar con su huella.';
  END IF;

  IF NOT (OLD.estado = 'a_firmar' AND NEW.estado = 'firmada')
    AND NEW.documento_id IS DISTINCT FROM OLD.documento_id THEN
    RAISE EXCEPTION 'FLAY: El documento del acta se fija al completar las firmas.';
  END IF;

  IF NEW.recordatorio_enviado_en IS DISTINCT FROM OLD.recordatorio_enviado_en
    AND (OLD.recordatorio_enviado_en IS NOT NULL OR OLD.estado <> 'a_firmar') THEN
    RAISE EXCEPTION 'FLAY: El recordatorio de firmas se envía una sola vez.';
  END IF;

  IF NEW.asamblea_id IS DISTINCT FROM OLD.asamblea_id THEN
    RAISE EXCEPTION 'FLAY: Un acta no cambia de asamblea.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER acta_reglas BEFORE INSERT OR UPDATE OR DELETE ON "ActaAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_acta_reglas();

-- Firmantes: designar en redaccion; firmar una vez; reemplazar solo pendientes -

CREATE OR REPLACE FUNCTION fn_firmante_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_acta "ActaAsamblea";
BEGIN
  SELECT * INTO v_acta FROM "ActaAsamblea" ac WHERE ac.id = (COALESCE(NEW, OLD)).acta_id;

  IF TG_OP = 'DELETE' THEN
    IF v_acta.id IS NOT NULL AND v_acta.estado <> 'en_redaccion' THEN
      RAISE EXCEPTION 'FLAY: Con el acta enviada a firmar, un firmante se reemplaza, no se quita.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_acta.estado <> 'en_redaccion' OR NEW.firmado_en IS NOT NULL OR NEW.hash_firmado IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: Los firmantes se designan con el acta en redacción.';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.acta_id IS DISTINCT FROM OLD.acta_id
    OR (NEW.rol_en_acta IS DISTINCT FROM OLD.rol_en_acta AND v_acta.estado <> 'en_redaccion') THEN
    RAISE EXCEPTION 'FLAY: El rol de un firmante no cambia una vez enviada el acta.';
  END IF;

  IF OLD.firmado_en IS NOT NULL THEN
    RAISE EXCEPTION 'FLAY: Esa firma ya está registrada y no cambia.';
  END IF;

  IF v_acta.estado = 'en_redaccion' THEN
    IF NEW.firmado_en IS NOT NULL OR NEW.hash_firmado IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: El acta todavía no se envió a firmar.';
    END IF;
    RETURN NEW;
  END IF;

  IF v_acta.estado <> 'a_firmar' THEN
    RAISE EXCEPTION 'FLAY: El acta ya está firmada.';
  END IF;

  -- Firma: el mismo firmante, una vez, con la huella del contenido.
  IF NEW.firmado_en IS NOT NULL THEN
    IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
      OR NEW.reemplaza_a IS DISTINCT FROM OLD.reemplaza_a
      OR NEW.hash_firmado IS DISTINCT FROM v_acta.hash_contenido THEN
      RAISE EXCEPTION 'FLAY: La firma no corresponde al contenido enviado a firmar.';
    END IF;
    RETURN NEW;
  END IF;

  -- Reemplazo de un firmante pendiente, en el mismo rol.
  IF NEW.hash_firmado IS NOT NULL
    OR NEW.usuario_id IS NOT DISTINCT FROM OLD.usuario_id
    OR NEW.reemplaza_a IS DISTINCT FROM OLD.usuario_id THEN
    RAISE EXCEPTION 'FLAY: Con el acta a firmar solo se puede firmar o reemplazar a un firmante pendiente.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER firmante_reglas BEFORE INSERT OR UPDATE OR DELETE ON "FirmanteActa"
FOR EACH ROW EXECUTE FUNCTION fn_firmante_reglas();

-- Auditoria (RN-15, FR-038) ----------------------------------------------------

CREATE TRIGGER auditar_asamblea AFTER INSERT OR UPDATE OR DELETE ON "Asamblea"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_punto_asamblea AFTER INSERT OR UPDATE OR DELETE ON "PuntoAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_opcion_punto AFTER INSERT OR UPDATE OR DELETE ON "OpcionPunto"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_poder AFTER INSERT OR UPDATE OR DELETE ON "Poder"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_unidad_en_asamblea AFTER INSERT OR UPDATE OR DELETE ON "UnidadEnAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_voto_asamblea AFTER INSERT OR UPDATE OR DELETE ON "VotoAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_oposicion_decision AFTER INSERT OR UPDATE OR DELETE ON "OposicionDecision"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_acta_asamblea AFTER INSERT OR UPDATE OR DELETE ON "ActaAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER auditar_firmante_acta AFTER INSERT OR UPDATE OR DELETE ON "FirmanteActa"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
