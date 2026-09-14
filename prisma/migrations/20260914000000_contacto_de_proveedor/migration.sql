-- Contacto del proveedor para la tarjeta de contactos utiles del resumen
-- (diseno 2026-09-13 § 5). Nulos: lo ya cargado sigue valido.
ALTER TABLE "Proveedor" ADD COLUMN "telefono" TEXT, ADD COLUMN "correo" TEXT;
