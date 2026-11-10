import { describe, expect, it } from 'vitest'

import {
  transicionActa,
  transicionAsamblea,
  TransicionInvalida,
  transicionPunto,
} from '@/dominio/asambleas/estado'

/**
 * Máquinas de estado de la asamblea, del punto y del acta (016, data-model).
 * Se escriben antes que la implementación (TDD); la base repite la regla en un
 * disparador para que un UPDATE directo tampoco la salte.
 */

describe('estado de la asamblea', () => {
  it('recorre el camino feliz de punta a punta', () => {
    expect(transicionAsamblea('borrador', 'convocar')).toBe('convocada')
    expect(transicionAsamblea('convocada', 'abrir')).toBe('en_curso')
    expect(transicionAsamblea('en_curso', 'finalizar', { constituida: true })).toBe('finalizada')
    expect(transicionAsamblea('finalizada', 'firmar_acta')).toBe('acta_firmada')
  })

  it('se cancela convocada, o en curso mientras no se constituyó', () => {
    expect(transicionAsamblea('convocada', 'cancelar')).toBe('cancelada')
    expect(transicionAsamblea('en_curso', 'cancelar', { constituida: false })).toBe('cancelada')
    expect(() => transicionAsamblea('en_curso', 'cancelar', { constituida: true })).toThrow(
      TransicionInvalida,
    )
  })

  it('no finaliza una asamblea que no se constituyó', () => {
    expect(() => transicionAsamblea('en_curso', 'finalizar', { constituida: false })).toThrow(
      TransicionInvalida,
    )
  })

  it('no vuelve atrás ni salta pasos', () => {
    expect(() => transicionAsamblea('convocada', 'convocar')).toThrow(TransicionInvalida)
    expect(() => transicionAsamblea('borrador', 'abrir')).toThrow(TransicionInvalida)
    expect(() => transicionAsamblea('finalizada', 'abrir')).toThrow(TransicionInvalida)
    expect(() => transicionAsamblea('cancelada', 'convocar')).toThrow(TransicionInvalida)
    expect(() => transicionAsamblea('acta_firmada', 'cancelar')).toThrow(TransicionInvalida)
    expect(() => transicionAsamblea('borrador', 'cancelar')).toThrow(TransicionInvalida)
  })

  it('explica el rechazo con palabras', () => {
    try {
      transicionAsamblea('finalizada', 'abrir')
      expect.unreachable()
    } catch (error) {
      expect((error as TransicionInvalida).mensajeParaUsuario).toMatch(/finalizada/i)
    }
  })
})

describe('estado del punto', () => {
  it('se abre una vez y se cierra una vez', () => {
    expect(transicionPunto('pendiente', 'abrir')).toBe('abierto')
    expect(transicionPunto('abierto', 'cerrar')).toBe('cerrado')
    expect(() => transicionPunto('pendiente', 'cerrar')).toThrow(TransicionInvalida)
    expect(() => transicionPunto('cerrado', 'abrir')).toThrow(TransicionInvalida)
    expect(() => transicionPunto('abierto', 'abrir')).toThrow(TransicionInvalida)
  })
})

describe('estado del acta', () => {
  it('se envía a firmar y queda firmada', () => {
    expect(transicionActa('en_redaccion', 'enviar')).toBe('a_firmar')
    expect(transicionActa('a_firmar', 'completar_firmas')).toBe('firmada')
    expect(() => transicionActa('en_redaccion', 'completar_firmas')).toThrow(TransicionInvalida)
    expect(() => transicionActa('firmada', 'enviar')).toThrow(TransicionInvalida)
  })
})
