import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * SC-006: la auditoria no se puede esquivar desde el codigo (RN-15, RNF-12).
 * flay_app deja asiento y no puede tocarlo; el disparador es generico, asi que
 * cualquier tabla economica futura nace auditada con una sola linea.
 */

const propietario = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL })
const aplicacion = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })

const TABLA = 'prueba_auditoria'

beforeAll(async () => {
  await propietario.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLA}";`)
  await propietario.$executeRawUnsafe(`
    CREATE TABLE "${TABLA}" (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nota TEXT NOT NULL
    );`)
  await propietario.$executeRawUnsafe(`
    CREATE TRIGGER auditar_${TABLA}
    AFTER INSERT OR UPDATE OR DELETE ON "${TABLA}"
    FOR EACH ROW EXECUTE FUNCTION fn_auditar();`)
  await propietario.$executeRawUnsafe(`DELETE FROM "BitacoraAuditoria" WHERE tabla = '${TABLA}';`)
}, 60_000)

afterAll(async () => {
  await propietario.$executeRawUnsafe(`DROP TABLE IF EXISTS "${TABLA}";`)
  await propietario.$executeRawUnsafe(`DELETE FROM "BitacoraAuditoria" WHERE tabla = '${TABLA}';`)
  await propietario.$disconnect()
  await aplicacion.$disconnect()
})

describe('bitacora de auditoria', () => {
  it('las tablas futuras nacen auditadas: alta, cambio y baja dejan asiento', async () => {
    const filas = await aplicacion.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "${TABLA}" (nota) VALUES ('original') RETURNING id;`,
    )
    const id = filas[0].id

    await aplicacion.$executeRawUnsafe(
      `UPDATE "${TABLA}" SET nota = 'corregida' WHERE id = $1::uuid;`,
      id,
    )
    await aplicacion.$executeRawUnsafe(`DELETE FROM "${TABLA}" WHERE id = $1::uuid;`, id)

    const asientos = await propietario.$queryRawUnsafe<
      { operacion: string; usuario: string; anterior: unknown; posterior: unknown }[]
    >(
      `SELECT operacion::text, usuario, anterior, posterior
       FROM "BitacoraAuditoria" WHERE tabla = '${TABLA}' AND clave = $1
       ORDER BY momento;`,
      id,
    )

    expect(asientos.map((a) => a.operacion)).toEqual(['INSERTA', 'MODIFICA', 'BORRA'])
    expect(asientos.every((a) => a.usuario === 'flay_app')).toBe(true)

    const [alta, cambio, baja] = asientos
    expect(alta.anterior).toBeNull()
    expect(alta.posterior).toMatchObject({ nota: 'original' })
    expect(cambio.anterior).toMatchObject({ nota: 'original' })
    expect(cambio.posterior).toMatchObject({ nota: 'corregida' })
    expect(baja.anterior).toMatchObject({ nota: 'corregida' })
    expect(baja.posterior).toBeNull()
  })

  it('flay_app no puede escribir la bitacora: tres veces permiso denegado', async () => {
    const escrituras = [
      `INSERT INTO "BitacoraAuditoria" (usuario, tabla, clave, operacion, actualizado_en)
       VALUES ('impostor', '${TABLA}', 'x', 'INSERTA', CURRENT_TIMESTAMP);`,
      `UPDATE "BitacoraAuditoria" SET usuario = 'impostor';`,
      `DELETE FROM "BitacoraAuditoria";`,
    ]

    for (const sentencia of escrituras) {
      await expect(aplicacion.$executeRawUnsafe(sentencia)).rejects.toThrow(/permission denied/i)
    }
  })

  it('flay_app si puede leer la bitacora', async () => {
    const [{ hay }] = await aplicacion.$queryRawUnsafe<{ hay: bigint }[]>(
      `SELECT count(*) AS hay FROM "BitacoraAuditoria";`,
    )
    expect(Number(hay)).toBeGreaterThanOrEqual(0)
  })
})
