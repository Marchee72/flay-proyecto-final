-- Horario de uso y rechazo por deuda configurables por espacio (RF-15, CU-09).
-- Minutos desde las 00:00 (hora argentina) en lugar de TIME: el dominio trabaja en minutos.
ALTER TABLE "EspacioComun"
  ADD COLUMN "apertura_minutos" SMALLINT,
  ADD COLUMN "cierre_minutos" SMALLINT,
  ADD COLUMN "rechaza_con_deuda" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "EspacioComun"
  ADD CONSTRAINT "EspacioComun_horario_completo" CHECK ((apertura_minutos IS NULL) = (cierre_minutos IS NULL)),
  ADD CONSTRAINT "EspacioComun_apertura_rango" CHECK (apertura_minutos BETWEEN 0 AND 1439),
  ADD CONSTRAINT "EspacioComun_cierre_rango" CHECK (cierre_minutos BETWEEN 0 AND 1439),
  ADD CONSTRAINT "EspacioComun_horario_distinto" CHECK (apertura_minutos <> cierre_minutos);
