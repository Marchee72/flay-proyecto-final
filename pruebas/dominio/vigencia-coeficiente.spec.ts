import { describe, expect, it } from 'vitest'

import { importe } from '@/compartido/dinero'
import { planificarCambioDeCoeficiente, VigenciaRetroactiva } from '@/dominio/coeficientes/vigencia'

import { relojFijo } from './reloj-fijo'

/**
 * Regla RN-02 y FR-012, con reloj fijo. Prueba escrita **antes** que la
 * implementacion: un coeficiente que cambia hacia atras reescribe liquidaciones
 * ya emitidas, y eso no se nota hasta que alguien reclama.
 */

const HOY = relojFijo('2026-09-09T12:00:00Z')

const fecha = (dia: string) => new Date(`${dia}T00:00:00Z`)

describe('cambio de coeficiente (regla RN-02)', () => {
  it('una vigencia futura cierra la anterior el dia antes', () => {
    const plan = planificarCambioDeCoeficiente(HOY, {
      coeficiente: importe('12.50000000'),
      vigenciaDesde: fecha('2026-10-01'),
    })

    expect(plan.apertura.vigenciaDesde).toEqual(fecha('2026-10-01'))
    expect(plan.cierreDelAnterior).toEqual(fecha('2026-09-30'))
    expect(plan.apertura.coeficiente.toFixed(8)).toBe('12.50000000')
  })

  it('hoy vale: lo prohibido es el pasado, no el presente', () => {
    const plan = planificarCambioDeCoeficiente(HOY, {
      coeficiente: importe('12.50000000'),
      vigenciaDesde: fecha('2026-09-09'),
    })

    expect(plan.cierreDelAnterior).toEqual(fecha('2026-09-08'))
  })

  it('una vigencia de ayer se rechaza (FR-012)', () => {
    expect(() =>
      planificarCambioDeCoeficiente(HOY, {
        coeficiente: importe('12.50000000'),
        vigenciaDesde: fecha('2026-09-08'),
      }),
    ).toThrow(VigenciaRetroactiva)
  })

  it('el rechazo dice desde cuando se puede, no un codigo', () => {
    let mensaje = ''
    try {
      planificarCambioDeCoeficiente(HOY, {
        coeficiente: importe('12.50000000'),
        vigenciaDesde: fecha('2020-01-01'),
      })
    } catch (error) {
      mensaje = (error as VigenciaRetroactiva).mensajeParaUsuario
    }

    expect(mensaje).toContain('2026-09-09')
  })

  it('el cambio de fin de mes cierra el anterior el ultimo dia del mes anterior', () => {
    const plan = planificarCambioDeCoeficiente(HOY, {
      coeficiente: importe('1.04166666'),
      vigenciaDesde: fecha('2027-01-01'),
    })

    expect(plan.cierreDelAnterior).toEqual(fecha('2026-12-31'))
  })
})
