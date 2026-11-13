-- B-1/B-2: el voto lee el punto con candado compartido (el cierre lo toma exclusivo) y la carga manual no pisa un voto propio.

CREATE OR REPLACE FUNCTION fn_voto_inmutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_punto     "PuntoAsamblea";
  v_asamblea  "EstadoAsamblea";
  v_presente  BOOLEAN;
  v_sin_voto  BOOLEAN;
BEGIN
  SELECT * INTO v_punto FROM "PuntoAsamblea" p WHERE p.id = (COALESCE(NEW, OLD)).punto_id FOR SHARE;

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
    IF OLD.origen = 'propio' AND NEW.origen = 'carga_manual' THEN
      RAISE EXCEPTION 'FLAY: Esa unidad ya votó este punto: solo quien la representa puede cambiar su voto.';
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
