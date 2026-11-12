import { describe, expect, it } from 'vitest'

import { errorDeCorreo } from '@/dominio/identidad/correo'

const MENSAJE_FORMATO =
  'Ese correo no tiene un formato válido: revisá que tenga @ y un dominio, como nombre@ejemplo.com.'

describe('errorDeCorreo (RF-03)', () => {
  it('pide el correo cuando está vacío o solo tiene espacios', () => {
    expect(errorDeCorreo('')).toBe('Escribí el correo.')
    expect(errorDeCorreo('   ')).toBe('Escribí el correo.')
  })

  it('rechaza lo que no tiene la forma nombre@dominio.ext', () => {
    expect(errorDeCorreo('ana@')).toBe(MENSAJE_FORMATO)
    expect(errorDeCorreo('ana@flay')).toBe(MENSAJE_FORMATO)
    expect(errorDeCorreo('ana flay@x.com')).toBe(MENSAJE_FORMATO)
  })

  it('acepta el correo y recorta los espacios antes de validar', () => {
    expect(errorDeCorreo('ana@flay.demo')).toBeNull()
    expect(errorDeCorreo(' ANA@Flay.Demo ')).toBeNull()
  })
})
