-- Migracion de datos (004-servicios, research R-07, SC-007): 003 dejo las
-- notificaciones en `pendiente` sin despachador. Desde ahora toda notificacion
-- nace con su TrabajoPendiente; esta sentencia encola las que ya existian, una
-- sola vez, para que ningun aviso se pierda entre etapas. Es idempotente: solo
-- toma las que no tienen trabajo.
INSERT INTO "TrabajoPendiente" ("tipo", "carga", "estado")
SELECT 'notificacion', jsonb_build_object('notificacionId', n.id), 'pendiente'
FROM "Notificacion" n
WHERE n."estadoEnvio" = 'pendiente'
  AND NOT EXISTS (
    SELECT 1 FROM "TrabajoPendiente" t
    WHERE t.tipo = 'notificacion' AND t.carga ->> 'notificacionId' = n.id::text
  );
