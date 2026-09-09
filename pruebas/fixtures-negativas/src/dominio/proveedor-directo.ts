// Fixture 4 (FR-022, I-04): el dominio importando el proveedor de datos.
// Mensaje esperado: "El dominio no conoce la base de datos".
import { PrismaClient } from '@prisma/client'

export const cliente = new PrismaClient()
