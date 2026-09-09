// El dominio no conoce la base de datos (Principio III, SC-002).
// Si alguna prueba de dominio intentara conectarse, no tiene con que.
delete process.env.DATABASE_URL
delete process.env.DIRECT_DATABASE_URL
delete process.env.SHADOW_DATABASE_URL
