import { describe, expect, it } from 'vitest'

import { sinEnlaces } from '@/aplicacion/asistente/base'

/**
 * Lo unico que el asistente no le muestra al proveedor de IA de lo que ve la
 * interfaz: los enlaces firmados (credenciales temporales). Se filtra por valor
 * y no por clave, porque `direccion` tambien es la calle del consorcio.
 */
describe('sinEnlaces (RF-27)', () => {
  it('quita las URL en cualquier nivel y conserva el resto', () => {
    const entrada = {
      direccion: 'https://blob.example/x?firma=abc',
      expensas: [{ periodo: '07/2026', descarga: 'http://blob.example/y', saldo: '10.00' }],
    }
    expect(sinEnlaces(entrada)).toEqual({
      direccion: null,
      expensas: [{ periodo: '07/2026', descarga: null, saldo: '10.00' }],
    })
  })

  it('no confunde la calle del consorcio con un enlace', () => {
    expect(sinEnlaces({ direccion: 'Mitre 456', fecha: new Date('2026-01-01') })).toEqual({
      direccion: 'Mitre 456',
      fecha: new Date('2026-01-01'),
    })
  })
})
