import { describe, expect, it } from 'vitest'

// SC-002: si el dominio necesitara la base, esta prueba no podria pasar.
describe('proyecto dominio', () => {
  it('corre sin conexion a la base de datos', () => {
    expect(process.env.DATABASE_URL).toBeUndefined()
    expect(process.env.DIRECT_DATABASE_URL).toBeUndefined()
  })
})
