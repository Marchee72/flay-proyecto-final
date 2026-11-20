-- RN-22: el candado de solo lectura, para las tablas hijas sin consorcio_id que
-- se escriben sin tocar a su padre en la misma transaccion. El consorcio se
-- resuelve por el padre: TG_ARGV[0] es la tabla padre y TG_ARGV[1] la columna
-- que la referencia. Mismo mensaje que fn_consorcio_no_archivado().
-- DetalleLiquidacion queda afuera a proposito: el PDF de la expensa escribe su
-- clave y el consorcista la sigue recibiendo.

CREATE FUNCTION fn_consorcio_no_archivado_por_padre() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_fila      JSONB;
  v_archivado BOOLEAN;
BEGIN
  FOREACH v_fila IN ARRAY ARRAY[
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END
  ] LOOP
    CONTINUE WHEN v_fila IS NULL OR v_fila ->> TG_ARGV[1] IS NULL;
    EXECUTE format(
      'SELECT c.archivado_en IS NOT NULL FROM %I p JOIN "Consorcio" c ON c.id = p.consorcio_id WHERE p.id = $1',
      TG_ARGV[0])
    INTO v_archivado USING (v_fila ->> TG_ARGV[1])::uuid;
    IF v_archivado THEN
      RAISE EXCEPTION 'FLAY: Este consorcio está archivado: se puede consultar, pero no operar.';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER consorcio_no_archivado BEFORE INSERT OR UPDATE OR DELETE ON "Comprobante"
  FOR EACH ROW EXECUTE FUNCTION fn_consorcio_no_archivado_por_padre('Gasto', 'gasto_id');
CREATE TRIGGER consorcio_no_archivado BEFORE INSERT OR UPDATE OR DELETE ON "Ocupacion"
  FOR EACH ROW EXECUTE FUNCTION fn_consorcio_no_archivado_por_padre('Unidad', 'unidad_id');
CREATE TRIGGER consorcio_no_archivado BEFORE INSERT OR UPDATE OR DELETE ON "SugerenciaReclamo"
  FOR EACH ROW EXECUTE FUNCTION fn_consorcio_no_archivado_por_padre('Reclamo', 'reclamo_id');
CREATE TRIGGER consorcio_no_archivado BEFORE INSERT OR UPDATE OR DELETE ON "FragmentoDocumento"
  FOR EACH ROW EXECUTE FUNCTION fn_consorcio_no_archivado_por_padre('DocumentoConsorcio', 'documento_id');
