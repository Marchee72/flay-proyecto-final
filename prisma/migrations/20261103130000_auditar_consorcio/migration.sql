-- Auditoria del consorcio (RN-15, 016 FR-035): sus reglas condicionan importes
-- (tasa de mora, vencimiento) y decisiones de asamblea (mayoria, mora sin voto).
CREATE TRIGGER auditar_consorcio
AFTER INSERT OR UPDATE OR DELETE ON "Consorcio"
FOR EACH ROW EXECUTE FUNCTION fn_auditar();
