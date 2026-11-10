-- Observaciones de los presentes (RF-32): lo que cada persona pide tener en
-- cuenta para el acta, al terminar el orden del día. Es un hijo más de la
-- asamblea: no se borra solo y cae en cascada con ella.

CREATE TABLE "ObservacionAsamblea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "consorcio_id" UUID NOT NULL,
    "asamblea_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "unidades" VARCHAR(200) NOT NULL,
    "texto" VARCHAR(1000) NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservacionAsamblea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ObservacionAsamblea_consorcio_id_idx" ON "ObservacionAsamblea"("consorcio_id");

CREATE UNIQUE INDEX "ObservacionAsamblea_asamblea_id_usuario_id_key" ON "ObservacionAsamblea"("asamblea_id", "usuario_id");

ALTER TABLE "ObservacionAsamblea" ADD CONSTRAINT "ObservacionAsamblea_consorcio_id_fkey" FOREIGN KEY ("consorcio_id") REFERENCES "Consorcio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ObservacionAsamblea" ADD CONSTRAINT "ObservacionAsamblea_asamblea_id_fkey" FOREIGN KEY ("asamblea_id") REFERENCES "Asamblea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION fn_observacion_reglas() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_fila   "ObservacionAsamblea";
  v_estado "EstadoAsamblea";
BEGIN
  v_fila := COALESCE(NEW, OLD);
  SELECT a.estado INTO v_estado FROM "Asamblea" a WHERE a.id = v_fila.asamblea_id;

  IF TG_OP = 'DELETE' THEN
    IF v_estado IS NOT NULL THEN
      RAISE EXCEPTION 'FLAY: Una observación no se borra.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.asamblea_id IS DISTINCT FROM OLD.asamblea_id
    OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id
  ) THEN
    RAISE EXCEPTION 'FLAY: Una observación no cambia de autor.';
  END IF;

  IF v_estado <> 'en_curso' OR EXISTS (
    SELECT 1 FROM "PuntoAsamblea" p
    WHERE p.asamblea_id = NEW.asamblea_id AND p.estado <> 'cerrado'
  ) THEN
    RAISE EXCEPTION 'FLAY: Las observaciones se escriben después de tratar todo el orden del día y antes de finalizar.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER observacion_reglas BEFORE INSERT OR UPDATE OR DELETE ON "ObservacionAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_observacion_reglas();

CREATE TRIGGER auditar_observacion_asamblea AFTER INSERT OR UPDATE OR DELETE ON "ObservacionAsamblea"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
