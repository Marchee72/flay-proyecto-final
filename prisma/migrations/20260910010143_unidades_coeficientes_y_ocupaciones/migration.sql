-- CreateEnum
CREATE TYPE "TipoOcupacion" AS ENUM ('propietario', 'inquilino');

-- CreateTable
CREATE TABLE "Unidad" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "designacion" TEXT NOT NULL,
    "coeficiente" DECIMAL(11,8) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoeficienteHistorico" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unidad_id" UUID NOT NULL,
    "coeficiente" DECIMAL(11,8) NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoeficienteHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ocupacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "unidad_id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "tipo" "TipoOcupacion" NOT NULL,
    "vigencia" daterange NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ocupacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unidad_consorcio_id_idx" ON "Unidad"("consorcio_id");

-- CreateIndex
CREATE UNIQUE INDEX "Unidad_consorcio_id_designacion_key" ON "Unidad"("consorcio_id", "designacion");

-- CreateIndex
CREATE INDEX "CoeficienteHistorico_unidad_id_vigencia_desde_idx" ON "CoeficienteHistorico"("unidad_id", "vigencia_desde");

-- CreateIndex
CREATE INDEX "Ocupacion_unidad_id_idx" ON "Ocupacion"("unidad_id");

-- CreateIndex
CREATE INDEX "Ocupacion_persona_id_idx" ON "Ocupacion"("persona_id");

-- AddForeignKey
ALTER TABLE "Unidad" ADD CONSTRAINT "Unidad_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoeficienteHistorico" ADD CONSTRAINT "CoeficienteHistorico_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ocupacion" ADD CONSTRAINT "Ocupacion_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "Unidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ocupacion" ADD CONSTRAINT "Ocupacion_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- Lo que sigue va escrito a mano: el mapeador no modela disparadores ni
-- restricciones de exclusion, y estos invariantes tienen que vivir en la base.
-- Que la aplicacion tambien los verifique sirve para dar un mensaje
-- comprensible (RNF-10); lo que **garantiza** el invariante es esto.
-- ===========================================================================

-- 1. Suma de coeficientes = 100.00000000 (regla RN-01, FR-011b, FR-011c) -----
--
-- Diferido a proposito: un alta carga N unidades en una transaccion y solo la
-- ultima la deja cuadrada. Inmediato rechazaria la primera.
CREATE OR REPLACE FUNCTION fn_verificar_suma_coeficientes() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fila        JSONB;
  v_consorcio   UUID;
  v_unidades    INTEGER;
  v_suma        NUMERIC(20,8);
BEGIN
  -- En un disparador de DELETE, NEW no esta asignado: leer el campo daria error.
  IF TG_OP = 'DELETE' THEN v_fila := to_jsonb(OLD); ELSE v_fila := to_jsonb(NEW); END IF;

  IF TG_TABLE_NAME = 'Unidad' THEN
    v_consorcio := (v_fila ->> 'consorcio_id')::UUID;
  ELSE
    SELECT u.consorcio_id INTO v_consorcio
    FROM "Unidad" u WHERE u.id = (v_fila ->> 'unidad_id')::UUID;
  END IF;

  IF v_consorcio IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*), COALESCE(SUM(u.coeficiente), 0)
  INTO v_unidades, v_suma
  FROM "Unidad" u WHERE u.consorcio_id = v_consorcio;

  -- Un consorcio sin ninguna unidad no viola la regla (FR-011c).
  IF v_unidades = 0 THEN RETURN NULL; END IF;

  IF v_suma <> 100.00000000 THEN
    RAISE EXCEPTION
      'RN-01: los coeficientes del consorcio % suman %, no 100.00000000',
      v_consorcio, to_char(v_suma, 'FM990.00000000')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

-- Mismo invariante, pero **en cada fecha** que la historia declara: un cambio
-- con vigencia futura no toca "Unidad" y sin esto dejaria un conjunto que no
-- suma 100 esperando a entrar en vigor (regla RN-02).
--
-- Una fecha en la que no todas las unidades tienen coeficiente vigente no se
-- evalua: un conjunto incompleto no dice nada, igual que un consorcio sin
-- unidades.
CREATE OR REPLACE FUNCTION fn_verificar_suma_historica() RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fila      JSONB;
  v_consorcio UUID;
  v_unidades  INTEGER;
  v_fecha     DATE;
  v_cubiertas INTEGER;
  v_suma      NUMERIC(20,8);
BEGIN
  IF TG_OP = 'DELETE' THEN v_fila := to_jsonb(OLD); ELSE v_fila := to_jsonb(NEW); END IF;

  SELECT u.consorcio_id INTO v_consorcio
  FROM "Unidad" u WHERE u.id = (v_fila ->> 'unidad_id')::UUID;

  IF v_consorcio IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(*) INTO v_unidades FROM "Unidad" u WHERE u.consorcio_id = v_consorcio;
  IF v_unidades = 0 THEN RETURN NULL; END IF;

  FOR v_fecha IN
    SELECT DISTINCT h.vigencia_desde
    FROM "CoeficienteHistorico" h
    JOIN "Unidad" u ON u.id = h.unidad_id
    WHERE u.consorcio_id = v_consorcio
  LOOP
    SELECT COUNT(DISTINCT h.unidad_id), COALESCE(SUM(h.coeficiente), 0)
    INTO v_cubiertas, v_suma
    FROM "CoeficienteHistorico" h
    JOIN "Unidad" u ON u.id = h.unidad_id
    WHERE u.consorcio_id = v_consorcio
      AND h.vigencia_desde <= v_fecha
      AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= v_fecha);

    CONTINUE WHEN v_cubiertas <> v_unidades;

    IF v_suma <> 100.00000000 THEN
      RAISE EXCEPTION
        'RN-01: al % los coeficientes del consorcio % suman %, no 100.00000000',
        v_fecha, v_consorcio, to_char(v_suma, 'FM990.00000000')
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER verificar_suma_coeficientes
AFTER INSERT OR UPDATE OR DELETE ON "Unidad"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_verificar_suma_coeficientes();

CREATE CONSTRAINT TRIGGER verificar_suma_historica
AFTER INSERT OR UPDATE OR DELETE ON "CoeficienteHistorico"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION fn_verificar_suma_historica();

-- 2. Un solo inquilino vigente por unidad (regla RN-09, FR-008, SC-005) ------
--
-- Solo inquilinos: varios propietarios vigentes son el condominio, que es lo
-- normal en propiedad horizontal. Se apoya en btree_gist, que instalo 001.
ALTER TABLE "Ocupacion"
  ADD CONSTRAINT "Ocupacion_inquilino_sin_superposicion"
  EXCLUDE USING gist (unidad_id WITH =, vigencia WITH &&)
  WHERE (tipo = 'inquilino');

-- 3. Auditoria de las tablas economicas (RN-15, FR-025) ---------------------
CREATE TRIGGER auditar_unidad
AFTER INSERT OR UPDATE OR DELETE ON "Unidad"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_coeficiente_historico
AFTER INSERT OR UPDATE OR DELETE ON "CoeficienteHistorico"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
