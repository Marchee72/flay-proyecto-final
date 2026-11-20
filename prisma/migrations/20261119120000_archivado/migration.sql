-- Archivado (RN-22): espacios, documentos y consorcios se archivan en vez de borrarse.
ALTER TABLE "Consorcio" ADD COLUMN "archivado_en" TIMESTAMPTZ(6);
ALTER TABLE "EspacioComun" ADD COLUMN "archivado_en" TIMESTAMPTZ(6);
ALTER TABLE "DocumentoConsorcio" ADD COLUMN "archivado_en" TIMESTAMPTZ(6);

CREATE TRIGGER auditar_espacio_comun
AFTER INSERT OR UPDATE OR DELETE ON "EspacioComun"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE TRIGGER auditar_documento_consorcio
AFTER INSERT OR UPDATE OR DELETE ON "DocumentoConsorcio"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();

-- Candado de solo lectura: un consorcio archivado se consulta, no se opera.
CREATE FUNCTION fn_consorcio_no_archivado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v := OLD.consorcio_id;
  ELSE
    v := NEW.consorcio_id;
  END IF;
  IF v IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF EXISTS (SELECT 1 FROM "Consorcio" WHERE id = v AND archivado_en IS NOT NULL) THEN
    RAISE EXCEPTION 'FLAY: Este consorcio está archivado: se puede consultar, pero no operar.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables x USING (table_schema, table_name)
    WHERE c.table_schema = 'public' AND c.column_name = 'consorcio_id' AND x.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('Habilitacion', 'Notificacion', 'ConsultaDocumental', 'ConversacionAsistente')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER consorcio_no_archivado BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fn_consorcio_no_archivado()',
      t);
  END LOOP;
END;
$$;
