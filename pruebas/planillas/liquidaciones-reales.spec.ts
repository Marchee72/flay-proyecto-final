import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { prorratear, type UnidadDelPadron } from '@/dominio/liquidacion/prorrateo'

/**
 * Validacion en paralelo (paquete 4.6, `FR-031` a `FR-033`, SC-005, riesgo
 * RT-01 § 11.2).
 *
 * La unica evidencia real de que el motor sirve: se le dan el padron y los
 * gastos de un mes que el cliente ya liquido a mano, y se compara **al centavo**
 * contra su planilla, importe por importe, incluido el ajuste de redondeo.
 *
 * Corre **sin base de datos**, como todo lo del motor: eso es lo que hace que
 * esta comparacion sea barata de repetir cada vez que se toca el calculo, que es
 * exactamente lo que el riesgo RT-01 pide.
 */

const RAIZ = 'datos-cliente/liquidaciones-reales'
const MESES = ['2026-06', '2026-07', '2026-08'] as const

type Fila = Record<string, string>

/** CSV con `;` y encabezado, tal como lo entrega el cliente. */
function leer(archivo: string): Fila[] {
  const [encabezado, ...lineas] = readFileSync(`${RAIZ}/${archivo}`, 'utf8')
    .split(/\r?\n/)
    .filter((linea) => linea.trim() !== '')

  const columnas = encabezado.split(';').map((columna) => columna.trim())

  return lineas.map((linea) => {
    const campos = linea.split(';')
    return Object.fromEntries(columnas.map((columna, i) => [columna, (campos[i] ?? '').trim()]))
  })
}

/**
 * Los totales del mes se suman en **centavos enteros**: la planilla es la
 * entrada del cliente, no una salida del sistema, y sumarla con el decimal del
 * dominio ocultaria una diferencia de origen detras de la propia aritmetica.
 */
const totalDe = (gastos: Fila[], clasificacion: 'ordinario' | 'extraordinario') =>
  (
    gastos
      .filter((gasto) => gasto.tipo === clasificacion)
      .reduce((total, gasto) => total + Math.round(Number(gasto.importe) * 100), 0) / 100
  ).toFixed(2)

/**
 * **La única diferencia de convención entre los dos documentos**, encontrada al
 * comparar 2026-07 y explicada acá porque `FR-032` no admite discrepancias sin
 * explicación.
 *
 * La planilla del cliente le **resta el ajuste a la columna «ordinario»** —en
 * 1A, `125000.13 - 0.04 = 125000.09`— y además lo muestra en su propia columna.
 * El sistema deja el importe intacto y el ajuste aparte, porque la regla RN-07
 * (§ 7.2) y el Principio II exigen que la diferencia quede «en un campo propio,
 * no mezclada con el importe»: así se le puede explicar a un propietario de
 * dónde salieron sus centavos.
 *
 * No es una diferencia de cálculo: **lo que cada unidad paga es idéntico al
 * centavo en los dos documentos**, y por eso la comparación de `total` sí es
 * exacta. Sólo se traduce la columna para poder compararla.
 */
const conAjusteAdentro = (detalle: { importeOrdinario: string; ajusteRedondeo: string }) =>
  (
    (Math.round(Number(detalle.importeOrdinario) * 100) +
      Math.round(Number(detalle.ajusteRedondeo) * 100)) /
    100
  ).toFixed(2)

const padron: UnidadDelPadron[] = leer('padron-coeficientes.csv').map((fila, i) => ({
  unidadId: `u-${String(i + 1).padStart(3, '0')}`,
  designacion: fila.unidad,
  coeficiente: fila.coeficiente,
}))

describe('las tres liquidaciones reales del cliente (SC-005)', () => {
  it('el padron del cliente cierra en 100.00000000', () => {
    expect(padron.length).toBeGreaterThan(0)
    // Si no cerrara, el motor abortaria y no habria nada que comparar.
    expect(() =>
      prorratear({ padron, totalOrdinario: '0.00', totalExtraordinario: '0.00' }),
    ).not.toThrow()
  })

  it.each(MESES)('%s coincide al centavo, importe por importe', (mes) => {
    const gastos = leer(`gastos-${mes}.csv`)
    const planilla = leer(`planilla-${mes}.csv`)

    const resultado = prorratear({
      padron,
      totalOrdinario: totalDe(gastos, 'ordinario'),
      totalExtraordinario: totalDe(gastos, 'extraordinario'),
    })

    const porUnidad = new Map(resultado.detalles.map((detalle) => [detalle.designacion, detalle]))

    // La planilla cierra con una fila `TOTAL` escrita a mano. No es una unidad,
    // pero sirve para lo que mas importa: que el total del cliente y el del
    // motor sean el mismo numero.
    const pie = planilla.find((fila) => fila.unidad === 'TOTAL')
    const unidades = planilla.filter((fila) => fila.unidad !== 'TOTAL')

    expect(unidades.length).toBe(padron.length)

    if (pie) {
      const declarado = Object.values(pie)
        .filter((valor) => /^\d+(\.\d{2})?$/.test(valor))
        .pop()
      expect(declarado).toBe(resultado.totalGeneral)
    }

    for (const fila of unidades) {
      const calculado = porUnidad.get(fila.unidad)
      expect(calculado, `la planilla trae ${fila.unidad} y el padrón no`).toBeDefined()

      expect({
        unidad: fila.unidad,
        ordinario: conAjusteAdentro(calculado!),
        extraordinario: calculado!.importeExtraordinario,
        ajuste: calculado!.ajusteRedondeo,
        total: calculado!.totalUnidad,
      }).toEqual({
        unidad: fila.unidad,
        ordinario: fila.ordinario,
        extraordinario: fila.extraordinario,
        ajuste: fila.ajuste_redondeo,
        total: fila.total,
      })
    }
  })
})
