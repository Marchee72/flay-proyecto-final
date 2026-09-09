-- Migracion inicial de Flay (001-andamiaje, FR-009/FR-010).
-- Orden exigido: roles, extensiones, bitacora, fn_auditar(), REVOKE.
-- Corre como flay_owner (DIRECT_DATABASE_URL). La aplicacion nunca corre DDL.

-- 0. Roles ------------------------------------------------------------------
-- Local los crea el contenedor; en demostracion el propietario es el rol
-- administrador del proveedor. La guarda evita que la migracion falle si el rol
-- de aplicacion todavia no existe: sin el, el REVOKE del paso 5 no tendria sujeto.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'flay_app') THEN
    CREATE ROLE flay_app NOLOGIN;
  END IF;
END
$$;

-- 1-3. Extensiones ----------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;      -- indice vectorial (RF-20)
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- restricciones de exclusion (RN-09, RN-10)
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- identificadores no secuenciales (§12.3)

-- 4. Bitacora ---------------------------------------------------------------
CREATE TYPE "Operacion" AS ENUM ('INSERTA', 'MODIFICA', 'BORRA');

CREATE TABLE "BitacoraAuditoria" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "momento" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" TEXT NOT NULL,
    "tabla" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "operacion" "Operacion" NOT NULL,
    "anterior" JSONB,
    "posterior" JSONB,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BitacoraAuditoria_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BitacoraAuditoria_tabla_clave_idx" ON "BitacoraAuditoria"("tabla", "clave");
CREATE INDEX "BitacoraAuditoria_momento_idx" ON "BitacoraAuditoria"("momento");

-- Funcion generica de auditoria. SECURITY DEFINER: escribe con los permisos del
-- propietario, de modo que flay_app deje asiento sin poder tocar la bitacora.
CREATE OR REPLACE FUNCTION fn_auditar() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operacion "Operacion";
  v_clave     TEXT;
  v_anterior  JSONB;
  v_posterior JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_operacion := 'INSERTA';
    v_posterior := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_operacion := 'MODIFICA';
    v_anterior  := to_jsonb(OLD);
    v_posterior := to_jsonb(NEW);
  ELSE
    v_operacion := 'BORRA';
    v_anterior  := to_jsonb(OLD);
  END IF;

  v_clave := COALESCE(v_posterior, v_anterior) ->> 'id';

  INSERT INTO "BitacoraAuditoria"
    ("usuario", "tabla", "clave", "operacion", "anterior", "posterior", "actualizado_en")
  VALUES (
    COALESCE(NULLIF(current_setting('flay.usuario', true), ''), session_user),
    TG_TABLE_NAME,
    COALESCE(v_clave, ''),
    v_operacion,
    v_anterior,
    v_posterior,
    CURRENT_TIMESTAMP
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 5. Permisos ---------------------------------------------------------------
-- Ninguna ruta de codigo puede omitir la auditoria: el rol de la aplicacion
-- puede leer la bitacora, nunca escribirla (RNF-12, RN-15).
GRANT USAGE ON SCHEMA public TO flay_app;
GRANT SELECT ON "BitacoraAuditoria" TO flay_app;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "BitacoraAuditoria" FROM flay_app;

-- Las tablas de negocio futuras nacen con DML para flay_app y sin DDL.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO flay_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO flay_app;
