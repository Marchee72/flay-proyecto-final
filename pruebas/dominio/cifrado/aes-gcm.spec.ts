import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { cifrarTexto, descifrarTexto } from '@/infraestructura/cifrado/aes-gcm'

describe('cifrado AES-256-GCM', () => {
  const claveValidaBase64 = randomBytes(32).toString('base64')
  const textoSecreto = 'APP_USR-1234567890-abcdef-token-privado'

  it('cifra y descifra correctamente un texto secreto', () => {
    const empaquetado = cifrarTexto(textoSecreto, claveValidaBase64)
    expect(empaquetado).not.toBe(textoSecreto)

    const partes = empaquetado.split('.')
    expect(partes).toHaveLength(3) // iv, tag, datos cifrados

    const recuperado = descifrarTexto(empaquetado, claveValidaBase64)
    expect(recuperado).toBe(textoSecreto)
  })

  it('falla si el tag o el texto cifrado fueron alterados', () => {
    const empaquetado = cifrarTexto(textoSecreto, claveValidaBase64)
    const [iv, tag, cifrado] = empaquetado.split('.')
    const tagBuffer = Buffer.from(tag, 'base64')
    tagBuffer[0] ^= 1
    const tagAlterado = tagBuffer.toString('base64')
    const empaquetadoAlterado = `${iv}.${tagAlterado}.${cifrado}`

    expect(() => descifrarTexto(empaquetadoAlterado, claveValidaBase64)).toThrow()
  })

  it('falla si se intenta descifrar con una clave distinta', () => {
    const empaquetado = cifrarTexto(textoSecreto, claveValidaBase64)
    const otraClave = randomBytes(32).toString('base64')

    expect(() => descifrarTexto(empaquetado, otraClave)).toThrow()
  })

  it('rechaza una clave que no tenga exactamente 32 bytes', () => {
    const claveCorta = Buffer.from('clave-corta-invalida').toString('base64')
    expect(() => cifrarTexto(textoSecreto, claveCorta)).toThrow(/32 bytes/)
  })

  it('admite clave en formato hexadecimal de 64 caracteres (32 bytes)', () => {
    const claveHex = randomBytes(32).toString('hex')
    const empaquetado = cifrarTexto(textoSecreto, claveHex)
    const recuperado = descifrarTexto(empaquetado, claveHex)
    expect(recuperado).toBe(textoSecreto)
  })
})
