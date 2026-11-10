-- Acta asistida (RF-32, RN-14): las notas de la reunión y un borrador por punto.
-- El borrador vive aparte de `resumen`: lo que se firma es solo lo que una
-- persona guardó, y enviar a firmar sigue exigiendo `resumen`.

ALTER TYPE "TipoTrabajo" ADD VALUE 'redactar_acta';

ALTER TABLE "PuntoAsamblea"
  ADD COLUMN "notas" TEXT,
  ADD COLUMN "borrador_resumen" TEXT;

ALTER TABLE "ActaAsamblea"
  ADD COLUMN "borrador_pedido_en" TIMESTAMPTZ(6);

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

  IF NEW.notas IS DISTINCT FROM OLD.notas AND v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'FLAY: Las notas se toman durante la reunión.';
  END IF;

  IF NEW.resumen IS DISTINCT FROM OLD.resumen
    OR NEW.borrador_resumen IS DISTINCT FROM OLD.borrador_resumen THEN
    SELECT ac.estado INTO v_acta FROM "ActaAsamblea" ac WHERE ac.asamblea_id = NEW.asamblea_id;
    IF v_acta IS DISTINCT FROM 'en_redaccion' THEN
      RAISE EXCEPTION 'FLAY: El resumen se redacta con el acta en redacción; enviada a firmar, ya no cambia.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
