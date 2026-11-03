import { describe, expect, it } from 'vitest'

import { Decimal } from '@/compartido/dinero'
import {
  alcanzaUmbral,
  conteo,
  resultadoBinario,
  resultadoOpcionMultiple,
  type UnidadPadron,
  type Voto,
} from '@/dominio/asambleas/resultado'

/**
 * Resultado de un punto (FR-024, FR-025, research R-05). Doble cómputo:
 * unidades y coeficientes, en Decimal, sin dividir. Caso testigo de
 * quickstart § 1: cuatro unidades 40/30/20/10; la de 10 está ausente.
 */

const u = (unidadId: string, coef: string, presente = true, sinVoto = false): UnidadPadron => ({
  unidadId,
  coeficiente: new Decimal(coef),
  presente,
  sinVoto,
})

const testigo: UnidadPadron[] = [u('A', '40'), u('B', '30'), u('C', '20'), u('D', '10', false)]

const v = (unidadId: string, sentido: Voto['sentido']): Voto => ({ unidadId, sentido })

describe('alcanzaUmbral', () => {
  const c = (unidades: number, coef: string) => ({ unidades, coeficiente: new Decimal(coef) })

  it('absoluta: más de la mitad en los dos cómputos', () => {
    expect(alcanzaUmbral(c(2, '70'), c(3, '90'), 'absoluta')).toBe(true)
    expect(alcanzaUmbral(c(2, '45'), c(4, '90'), 'absoluta')).toBe(false) // empate en unidades
    expect(alcanzaUmbral(c(2, '45'), c(3, '90'), 'absoluta')).toBe(false) // empate en coeficientes
  })

  it('dos tercios: alcanzar los dos tercios exactos aprueba', () => {
    expect(alcanzaUmbral(c(2, '60'), c(3, '90'), 'dos_tercios')).toBe(true)
    expect(alcanzaUmbral(c(2, '59.99999999'), c(3, '90'), 'dos_tercios')).toBe(false)
  })

  it('unanimidad: todos los de la base', () => {
    expect(alcanzaUmbral(c(3, '90'), c(3, '90'), 'unanimidad')).toBe(true)
    expect(alcanzaUmbral(c(2, '70'), c(3, '90'), 'unanimidad')).toBe(false)
  })

  it('sin base no hay decisión', () => {
    expect(alcanzaUmbral(c(0, '0'), c(0, '0'), 'absoluta')).toBe(false)
    expect(alcanzaUmbral(c(0, '0'), c(0, '0'), 'unanimidad')).toBe(false)
  })
})

describe('conteo', () => {
  it('separa la base de presentes de la base total y deja afuera a los sin voto', () => {
    const padron = [...testigo, u('E', '0', true, true)]
    const r = conteo(padron, [v('A', 'positivo'), v('B', 'negativo'), v('C', 'abstencion')])
    expect(r.basePresentes.unidades).toBe(3)
    expect(r.basePresentes.coeficiente.toFixed(8)).toBe('90.00000000')
    expect(r.baseTotal.unidades).toBe(4)
    expect(r.baseTotal.coeficiente.toFixed(8)).toBe('100.00000000')
    expect(r.porOpcion.positivo.coeficiente.toFixed(8)).toBe('40.00000000')
    expect(r.porOpcion.abstencion.unidades).toBe(1)
  })

  it('ignora el voto de una unidad sin voto o ausente', () => {
    const padron = [u('A', '50'), u('B', '50', true, true), u('C', '0', false)]
    const r = conteo(padron, [v('A', 'positivo'), v('B', 'positivo'), v('C', 'positivo')])
    expect(r.porOpcion.positivo.unidades).toBe(1)
  })
})

describe('resultadoBinario', () => {
  it('caso testigo: 40 positivo no supera 45, se rechaza', () => {
    const r = resultadoBinario(
      testigo,
      [v('A', 'positivo'), v('B', 'negativo'), v('C', 'abstencion')],
      'absoluta',
      'presentes',
    )
    expect(r.resultado).toBe('rechazado')
    expect(r.provisorio).toBe(false)
  })

  it('caso testigo: con la de 30 también positiva se aprueba sobre los presentes', () => {
    const votos = [v('A', 'positivo'), v('B', 'positivo'), v('C', 'abstencion')]
    expect(resultadoBinario(testigo, votos, 'absoluta', 'presentes')).toMatchObject({
      resultado: 'aprobado',
      provisorio: false,
    })
  })

  it('caso testigo con «totalidad»: 2 de 4 unidades no supera la mitad, queda provisorio', () => {
    const votos = [v('A', 'positivo'), v('B', 'positivo'), v('C', 'abstencion')]
    expect(resultadoBinario(testigo, votos, 'absoluta', 'totalidad')).toMatchObject({
      resultado: 'aprobado',
      provisorio: true,
    })
  })

  it('con «totalidad», si alcanza sobre el total queda firme', () => {
    const votos = [v('A', 'positivo'), v('B', 'positivo'), v('C', 'positivo')]
    expect(resultadoBinario(testigo, votos, 'absoluta', 'totalidad')).toMatchObject({
      resultado: 'aprobado',
      provisorio: false,
    })
  })

  it('con «totalidad», si no alcanza ni sobre los presentes se rechaza', () => {
    const votos = [v('A', 'positivo'), v('B', 'negativo'), v('C', 'negativo')]
    expect(resultadoBinario(testigo, votos, 'absoluta', 'totalidad')).toMatchObject({
      resultado: 'rechazado',
      provisorio: false,
    })
  })

  it('la abstención no suma', () => {
    const padron = [u('A', '50'), u('B', '50')]
    expect(
      resultadoBinario(padron, [v('A', 'positivo'), v('B', 'abstencion')], 'absoluta', 'presentes')
        .resultado,
    ).toBe('rechazado')
  })

  it('un presente sin voto queda fuera de la base', () => {
    const padron = [u('A', '60'), u('B', '40', true, true)]
    expect(
      resultadoBinario(padron, [v('A', 'positivo')], 'unanimidad', 'presentes').resultado,
    ).toBe('aprobado')
  })

  it('un empate exacto se rechaza', () => {
    const padron = [u('A', '50'), u('B', '50')]
    expect(
      resultadoBinario(padron, [v('A', 'positivo'), v('B', 'negativo')], 'absoluta', 'presentes')
        .resultado,
    ).toBe('rechazado')
  })

  it('en unanimidad, una abstención impide la decisión', () => {
    const padron = [u('A', '50'), u('B', '50')]
    expect(
      resultadoBinario(
        padron,
        [v('A', 'positivo'), v('B', 'abstencion')],
        'unanimidad',
        'presentes',
      ).resultado,
    ).toBe('rechazado')
  })

  it('dos tercios con las dos bases', () => {
    const votos = [v('A', 'positivo'), v('B', 'positivo'), v('C', 'negativo')]
    // presentes: 2/3 unidades y 70/90 coeficientes → alcanza.
    expect(resultadoBinario(testigo, votos, 'dos_tercios', 'presentes').resultado).toBe('aprobado')
    // total: 2/4 unidades → no alcanza; sobre presentes sí → provisorio.
    expect(resultadoBinario(testigo, votos, 'dos_tercios', 'totalidad')).toMatchObject({
      resultado: 'aprobado',
      provisorio: true,
    })
  })

  it('un punto sin votos no se aprueba', () => {
    expect(resultadoBinario(testigo, [], 'absoluta', 'presentes').resultado).toBe('rechazado')
  })
})

describe('resultadoOpcionMultiple', () => {
  const opciones = ['X', 'Y', 'Z']
  const o = (unidadId: string, opcionId: string): Voto => ({ unidadId, opcionId })

  it('gana la opción más votada si coincide en unidades y coeficientes', () => {
    const padron = [u('A', '40'), u('B', '30'), u('C', '20'), u('D', '10')]
    const r = resultadoOpcionMultiple(
      padron,
      [o('A', 'X'), o('B', 'X'), o('C', 'Y'), o('D', 'Z')],
      opciones,
    )
    expect(r).toMatchObject({ resultado: 'aprobado', opcionGanadoraId: 'X' })
    expect(r.conteo.porOpcion.X.coeficiente.toFixed(8)).toBe('70.00000000')
  })

  it('sin decisión si los cómputos dan opciones distintas', () => {
    // Por unidades gana Y (2 contra 1); por coeficientes gana X (60 contra 40).
    const padron = [u('A', '60'), u('B', '20'), u('C', '20')]
    expect(
      resultadoOpcionMultiple(padron, [o('A', 'X'), o('B', 'Y'), o('C', 'Y')], opciones),
    ).toMatchObject({ resultado: 'sin_decision', opcionGanadoraId: undefined })
  })

  it('sin decisión si hay empate en el primer lugar', () => {
    const padron = [u('A', '50'), u('B', '50')]
    expect(resultadoOpcionMultiple(padron, [o('A', 'X'), o('B', 'Y')], opciones).resultado).toBe(
      'sin_decision',
    )
  })

  it('sin votos, sin decisión', () => {
    expect(resultadoOpcionMultiple(testigo, [], opciones).resultado).toBe('sin_decision')
  })
})
