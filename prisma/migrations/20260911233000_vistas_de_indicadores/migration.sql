-- Vistas materializadas de § 7.7 para los indicadores de § 12.9 (004-servicios,
-- FR-017 a FR-020, research R-11). Todo importe en NUMERIC de punta a punta;
-- el redondeo ocurre una sola vez, en la columna que se muestra. Cada vista
-- lleva consorcio_id y un indice unico, que REFRESH ... CONCURRENTLY exige.
--
-- Las vistas las posee flay_owner; flay_app solo las lee. El refresco corre
-- por una funcion SECURITY DEFINER, porque refrescar exige ser el dueño.

-- I-1: deuda vencida de lo liquidado en cada periodo, sobre la masa de ese
-- periodo. Misma definicion de "impago" que el estado de cuenta de 003: total
-- de la unidad menos lo imputado y no revertido, solo positivo, solo vencido.
CREATE MATERIALIZED VIEW v_morosidad_consorcio AS
WITH saldos AS (
  SELECT
    l.consorcio_id,
    p.anio,
    p.mes,
    d.unidad_id,
    d.total_unidad,
    d.total_unidad - COALESCE(SUM(i.importe_imputado) FILTER (WHERE i.revertida_en IS NULL), 0) AS saldo,
    l.vencimiento < CURRENT_DATE AS vencida
  FROM "Liquidacion" l
  JOIN "Periodo" p ON p.id = l.periodo_id
  JOIN "DetalleLiquidacion" d ON d.liquidacion_id = l.id
  LEFT JOIN "PagoImputacion" i ON i.detalle_liquidacion_id = d.id
  WHERE l.estado = 'vigente'
  GROUP BY l.consorcio_id, p.anio, p.mes, d.unidad_id, d.total_unidad, l.vencimiento
)
SELECT
  consorcio_id,
  anio,
  mes,
  SUM(total_unidad)::NUMERIC(14,2) AS masa_liquidada,
  COALESCE(SUM(saldo) FILTER (WHERE vencida AND saldo > 0), 0)::NUMERIC(14,2) AS deuda_vencida,
  COUNT(*) FILTER (WHERE vencida AND saldo > 0)::INTEGER AS unidades_en_mora,
  COUNT(*)::INTEGER AS unidades,
  CASE WHEN SUM(total_unidad) > 0
       THEN ROUND(COALESCE(SUM(saldo) FILTER (WHERE vencida AND saldo > 0), 0) * 100 / SUM(total_unidad), 2)
       ELSE NULL END::NUMERIC(5,2) AS porcentaje
FROM saldos
GROUP BY consorcio_id, anio, mes;

CREATE UNIQUE INDEX v_morosidad_consorcio_uq ON v_morosidad_consorcio (consorcio_id, anio, mes);

-- I-2: gasto por rubro y periodo, con el promedio movil de los doce periodos
-- anteriores del mismo consorcio y rubro (FR-019). Con menos de doce, NULL:
-- la interfaz dice "historia insuficiente" en vez de mostrar un desvio falso.
-- La ventana cuenta periodos con gasto en el rubro; un mes sin gasto no es un
-- cero en el promedio, y la alerta de "rubro recurrente sin gasto" (FR-023)
-- se detecta aparte, en la aplicacion.
CREATE MATERIALIZED VIEW v_gasto_rubro_periodo AS
WITH por_periodo AS (
  SELECT g.consorcio_id, g.rubro_id, p.anio, p.mes, SUM(g.importe)::NUMERIC(14,2) AS importe
  FROM "Gasto" g
  JOIN "Periodo" p ON p.id = g.periodo_id
  GROUP BY g.consorcio_id, g.rubro_id, p.anio, p.mes
),
con_ventana AS (
  SELECT
    *,
    AVG(importe) OVER w AS promedio_bruto,
    COUNT(*) OVER w AS periodos_anteriores
  FROM por_periodo
  WINDOW w AS (PARTITION BY consorcio_id, rubro_id ORDER BY anio, mes ROWS BETWEEN 12 PRECEDING AND 1 PRECEDING)
)
SELECT
  consorcio_id,
  rubro_id,
  anio,
  mes,
  importe,
  CASE WHEN periodos_anteriores >= 12 THEN ROUND(promedio_bruto, 2) ELSE NULL END::NUMERIC(14,2) AS promedio_movil_12,
  CASE WHEN periodos_anteriores >= 12 AND promedio_bruto > 0
       THEN ROUND((importe - promedio_bruto) * 100 / promedio_bruto, 1)
       ELSE NULL END::NUMERIC(6,1) AS desvio_porcentual,
  periodos_anteriores::INTEGER
FROM con_ventana;

CREATE UNIQUE INDEX v_gasto_rubro_periodo_uq ON v_gasto_rubro_periodo (consorcio_id, rubro_id, anio, mes);

-- I-3: costo y desempeño por proveedor y rubro. Las horas salen de los
-- reclamos resueltos asignados al proveedor; sin reclamos, NULL y no cero:
-- cero seria resolucion instantanea (caso limite de la spec).
CREATE MATERIALIZED VIEW v_desempeno_proveedor AS
WITH costos AS (
  SELECT consorcio_id, proveedor_id, rubro_id,
         SUM(importe)::NUMERIC(14,2) AS costo_acumulado,
         COUNT(*)::INTEGER AS contrataciones
  FROM "Gasto"
  WHERE proveedor_id IS NOT NULL
  GROUP BY consorcio_id, proveedor_id, rubro_id
),
tiempos AS (
  SELECT consorcio_id, proveedor_id, rubro_id,
         COUNT(*)::INTEGER AS reclamos_resueltos,
         ROUND(AVG(EXTRACT(EPOCH FROM (fecha_resolucion - fecha_apertura)) / 3600)::NUMERIC, 1) AS horas_medias_resolucion
  FROM "Reclamo"
  WHERE proveedor_id IS NOT NULL AND fecha_resolucion IS NOT NULL
  GROUP BY consorcio_id, proveedor_id, rubro_id
)
SELECT
  COALESCE(c.consorcio_id, t.consorcio_id) AS consorcio_id,
  COALESCE(c.proveedor_id, t.proveedor_id) AS proveedor_id,
  COALESCE(c.rubro_id, t.rubro_id) AS rubro_id,
  COALESCE(c.costo_acumulado, 0)::NUMERIC(14,2) AS costo_acumulado,
  COALESCE(c.contrataciones, 0) AS contrataciones,
  CASE WHEN c.contrataciones > 0 THEN ROUND(c.costo_acumulado / c.contrataciones, 2) ELSE NULL END::NUMERIC(14,2) AS costo_promedio,
  COALESCE(t.reclamos_resueltos, 0) AS reclamos_resueltos,
  t.horas_medias_resolucion::NUMERIC(8,1)
FROM costos c
FULL OUTER JOIN tiempos t
  ON t.consorcio_id = c.consorcio_id AND t.proveedor_id = c.proveedor_id
  AND t.rubro_id IS NOT DISTINCT FROM c.rubro_id;

CREATE UNIQUE INDEX v_desempeno_proveedor_uq
  ON v_desempeno_proveedor (consorcio_id, proveedor_id, rubro_id) NULLS NOT DISTINCT;

-- I-4: mediana y percentil 90 del tiempo de resolucion, por rubro y urgencia
-- (FR-020). Horas, no dinero: percentile_cont sobre double esta bien aca.
CREATE MATERIALIZED VIEW v_resolucion_reclamos AS
SELECT
  consorcio_id,
  rubro_id,
  urgencia,
  COUNT(*)::INTEGER AS cantidad,
  ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fecha_resolucion - fecha_apertura)) / 3600))::NUMERIC, 1)::NUMERIC(8,1) AS mediana_horas,
  ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (fecha_resolucion - fecha_apertura)) / 3600))::NUMERIC, 1)::NUMERIC(8,1) AS p90_horas
FROM "Reclamo"
WHERE fecha_resolucion IS NOT NULL
GROUP BY consorcio_id, rubro_id, urgencia;

CREATE UNIQUE INDEX v_resolucion_reclamos_uq
  ON v_resolucion_reclamos (consorcio_id, rubro_id, urgencia) NULLS NOT DISTINCT;

-- I-5 y punto 15: precision de las funciones asistidas y carga administrativa,
-- por consorcio y mes.
CREATE MATERIALIZED VIEW v_precision_asistencia AS
WITH extracciones AS (
  SELECT consorcio_id,
         EXTRACT(YEAR FROM procesado_en)::INTEGER AS anio,
         EXTRACT(MONTH FROM procesado_en)::INTEGER AS mes,
         COUNT(*) FILTER (WHERE estado IN ('confirmada', 'corregida'))::INTEGER AS extracciones_confirmadas,
         COUNT(*) FILTER (WHERE estado = 'confirmada')::INTEGER AS sin_correccion
  FROM "ExtraccionComprobante"
  WHERE procesado_en IS NOT NULL
  GROUP BY 1, 2, 3
),
sugerencias AS (
  SELECT r.consorcio_id,
         EXTRACT(YEAR FROM s.procesado_en)::INTEGER AS anio,
         EXTRACT(MONTH FROM s.procesado_en)::INTEGER AS mes,
         COUNT(*) FILTER (WHERE s.aceptada IS NOT NULL)::INTEGER AS sugerencias,
         COUNT(*) FILTER (WHERE s.aceptada)::INTEGER AS aceptadas
  FROM "SugerenciaReclamo" s
  JOIN "Reclamo" r ON r.id = s.reclamo_id
  GROUP BY 1, 2, 3
),
liquidaciones AS (
  SELECT l.consorcio_id, p.anio, p.mes,
         ROUND(AVG(EXTRACT(EPOCH FROM (l.emitida_en - p.creado_en)) / 3600)::NUMERIC, 1) AS horas_apertura_a_liquidacion
  FROM "Liquidacion" l
  JOIN "Periodo" p ON p.id = l.periodo_id
  WHERE l.estado = 'vigente'
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(e.consorcio_id, s.consorcio_id, q.consorcio_id) AS consorcio_id,
  COALESCE(e.anio, s.anio, q.anio) AS anio,
  COALESCE(e.mes, s.mes, q.mes) AS mes,
  COALESCE(e.extracciones_confirmadas, 0) AS extracciones_confirmadas,
  COALESCE(e.sin_correccion, 0) AS sin_correccion,
  COALESCE(s.sugerencias, 0) AS sugerencias,
  COALESCE(s.aceptadas, 0) AS aceptadas,
  q.horas_apertura_a_liquidacion::NUMERIC(8,1)
FROM extracciones e
FULL OUTER JOIN sugerencias s ON s.consorcio_id = e.consorcio_id AND s.anio = e.anio AND s.mes = e.mes
FULL OUTER JOIN liquidaciones q
  ON q.consorcio_id = COALESCE(e.consorcio_id, s.consorcio_id)
  AND q.anio = COALESCE(e.anio, s.anio) AND q.mes = COALESCE(e.mes, s.mes);

CREATE UNIQUE INDEX v_precision_asistencia_uq ON v_precision_asistencia (consorcio_id, anio, mes);

-- El refresco lo pide la aplicacion (boton y tarea programada) pero lo ejecuta
-- el dueño: SECURITY DEFINER es lo que permite que flay_app no sea dueño de
-- nada y aun asi refresque. CONCURRENTLY no bloquea las lecturas del panel.
CREATE OR REPLACE FUNCTION fn_refrescar_indicadores() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_morosidad_consorcio;
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_gasto_rubro_periodo;
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_desempeno_proveedor;
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_resolucion_reclamos;
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_precision_asistencia;
END;
$$;

REVOKE ALL ON FUNCTION fn_refrescar_indicadores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_refrescar_indicadores() TO flay_app;

GRANT SELECT ON v_morosidad_consorcio, v_gasto_rubro_periodo, v_desempeno_proveedor,
  v_resolucion_reclamos, v_precision_asistencia TO flay_app;
