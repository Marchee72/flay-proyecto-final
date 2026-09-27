-- RF-05: el CUIT del proveedor, normalizado a NN-NNNNNNNN-N. La unicidad
-- (consorcio_id, cuit) ya existia, pero comparaba el texto tal como se tipeo:
-- «20123456789» y «20-12345678-9» pasaban como dos proveedores distintos.
--
-- Solo se tocan los que tienen exactamente 11 digitos y cuya forma normalizada
-- no choca con otro proveedor del mismo consorcio; un duplicado que ya existe
-- queda como esta para que lo resuelva una persona, no esta migracion.
UPDATE "Proveedor" p
SET cuit = substr(d.digitos, 1, 2) || '-' || substr(d.digitos, 3, 8) || '-' || substr(d.digitos, 11, 1)
FROM (
  SELECT id, regexp_replace(cuit, '\D', '', 'g') AS digitos FROM "Proveedor"
) d
WHERE d.id = p.id
  AND length(d.digitos) = 11
  AND p.cuit <> substr(d.digitos, 1, 2) || '-' || substr(d.digitos, 3, 8) || '-' || substr(d.digitos, 11, 1)
  AND NOT EXISTS (
    SELECT 1 FROM "Proveedor" otro
    WHERE otro.consorcio_id = p.consorcio_id
      AND otro.id <> p.id
      AND regexp_replace(otro.cuit, '\D', '', 'g') = d.digitos
  );
