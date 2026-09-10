import { PrismaClient } from '@prisma/client'
import { Decimal } from 'decimal.js'

/**
 * Juego de datos ficticios de § 13.4 (FR-028): dos consorcios, de 12 y 96
 * unidades. **Deterministico**: dos corridas dan exactamente lo mismo, incluidos
 * los coeficientes, para que una medicion de ayer se pueda comparar con una de
 * hoy.
 *
 * Los coeficientes se reparten parejo y el resto se lo lleva la ultima unidad,
 * que es como queda un edificio real: 100 / 96 no da exacto y el reglamento se
 * lo carga a alguien. La suma da `100.00000000` exacto, que es lo que el
 * disparador de la base exige (regla RN-01, SC-001).
 *
 * No usa alias de rutas a proposito: lo importan tanto las pruebas como los
 * guiones de semilla, que corren fuera del empaquetador.
 */

const DECIMALES = 8

/**
 * Reparto parejo con el resto en la ultima, en decimal de precision fija. Con
 * el tipo numerico nativo, noventa y seis sumas de 1,04166666 no dan 100 y la
 * semilla no cargaria (Principio II).
 */
function coeficientes(cantidad: number): string[] {
  const total = new Decimal(100)
  const parejo = total.div(cantidad).toDecimalPlaces(DECIMALES, Decimal.ROUND_DOWN)
  const ultima = total.minus(parejo.times(cantidad - 1))

  return Array.from({ length: cantidad }, (_, i) =>
    (i === cantidad - 1 ? ultima : parejo).toFixed(DECIMALES),
  )
}

const unidades = (cantidad: number, piso: number) =>
  coeficientes(cantidad).map((coeficiente, i) => ({
    designacion: `${Math.floor(i / piso) + 1}${'ABCDEFGH'[i % piso]}`,
    coeficiente,
  }))

export const JUEGO = {
  administradora: { razonSocial: 'Grupo Delta S.R.L.', cuit: '30-71234567-0' },
  consorcios: [
    {
      nombre: 'Mitre 456',
      direccion: 'Bartolome Mitre 456',
      localidad: 'Rosario',
      cuit: '33-70000012-9',
      unidades: unidades(12, 4),
    },
    {
      nombre: 'San Luis 900',
      direccion: 'San Luis 900',
      localidad: 'Rosario',
      cuit: '33-70000096-9',
      unidades: unidades(96, 8),
    },
  ],
} as const

export interface JuegoSembrado {
  administradoraId: string
  consorcios: { id: string; nombre: string; unidades: number }[]
}

/**
 * Siembra el juego. Idempotente por CUIT: correrla dos veces no duplica nada.
 * La fecha de vigencia se recibe para que la semilla no dependa del dia.
 */
export async function sembrarJuego(
  cliente: PrismaClient,
  hoy = new Date('2026-01-01'),
): Promise<JuegoSembrado> {
  const administradora = await cliente.administradora.upsert({
    where: { cuit: JUEGO.administradora.cuit },
    update: {},
    create: { ...JUEGO.administradora },
  })

  const consorcios = []

  for (const definicion of JUEGO.consorcios) {
    const existente = await cliente.consorcio.findUnique({ where: { cuit: definicion.cuit } })

    const consorcio =
      existente ??
      (await cliente.consorcio.create({
        data: {
          administradoraId: administradora.id,
          nombre: definicion.nombre,
          direccion: definicion.direccion,
          localidad: definicion.localidad,
          cuit: definicion.cuit,
        },
      }))

    const cargadas = await cliente.unidad.count({ where: { consorcioId: consorcio.id } })

    // Las unidades entran en **una sola transaccion**: el disparador diferido
    // verifica al confirmar y ninguna carga parcial cuadra (FR-011c).
    if (cargadas === 0) {
      // Los identificadores se generan aca para poder escribir las dos tablas
      // con dos sentencias en vez de doscientas: noventa y seis idas y vueltas
      // contra una base remota no entran en el tiempo de una transaccion.
      const filas = definicion.unidades.map((unidad) => ({
        id: crypto.randomUUID(),
        consorcioId: consorcio.id,
        designacion: unidad.designacion,
        coeficiente: unidad.coeficiente,
      }))

      await cliente.$transaction(async (tx) => {
        await tx.unidad.createMany({ data: filas })
        await tx.coeficienteHistorico.createMany({
          data: filas.map((fila) => ({
            unidadId: fila.id,
            coeficiente: fila.coeficiente,
            vigenciaDesde: hoy,
          })),
        })
      })
    }

    consorcios.push({
      id: consorcio.id,
      nombre: consorcio.nombre,
      unidades: definicion.unidades.length,
    })
  }

  return { administradoraId: administradora.id, consorcios }
}
