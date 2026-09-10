import { PrismaClient } from '@prisma/client'
import { Decimal } from 'decimal.js'

/**
 * Juego de datos ficticios de § 13.4 (FR-028): dos consorcios, de 12 y 96
 * unidades. **Deterministico**: dos corridas dan exactamente lo mismo, incluidos
 * los coeficientes, para que una medicion de ayer se pueda comparar con una de
 * hoy.
 *
 * Los coeficientes son **los que § 13.4 fija**, no un reparto inventado: doce
 * unidades de tres tamanos en C-A, y en C-B noventa y cinco iguales con la
 * ultima llevandose el resto, que es como queda un edificio real. Los dos
 * suman `100.00000000` exacto, que es lo que el disparador de la base exige
 * (regla RN-01, SC-001).
 *
 * No usa alias de rutas a proposito: lo importan tanto las pruebas como los
 * guiones de semilla, que corren fuera del empaquetador.
 */

const DECIMALES = 8

/** Designaciones de edificio: piso y letra, `1A` a `12H`. */
const designacion = (indice: number, porPiso: number) =>
  `${Math.floor(indice / porPiso) + 1}${'ABCDEFGH'[indice % porPiso]}`

/**
 * C-A: doce unidades de tres tamanos, como las escribe § 13.4. Cuatro de cada
 * uno: 4x12,5 + 4x7,5 + 4x5 = 100 exacto.
 */
const doceUnidades = () =>
  ['12.50000000', '7.50000000', '5.00000000'].flatMap((coeficiente, tamano) =>
    Array.from({ length: 4 }, (_, i) => ({
      designacion: designacion(tamano * 4 + i, 4),
      coeficiente,
    })),
  )

/**
 * C-B: noventa y seis unidades practicamente iguales, y la ultima se lleva el
 * resto: 95x1,04166667 + 1x1,04166635 = 100 exacto, tal como § 13.4 lo fija.
 *
 * La cuenta va en decimal de precision fija: con el tipo numerico nativo,
 * noventa y cinco sumas de 1,04166667 no dan 98,95833365 y la semilla no
 * cargaria, porque el disparador de la base la rechazaria (Principio II).
 */
const noventaYSeisUnidades = () => {
  const comun = new Decimal('1.04166667')
  const ultima = new Decimal(100).minus(comun.times(95))

  return Array.from({ length: 96 }, (_, i) => ({
    designacion: designacion(i, 8),
    coeficiente: (i === 95 ? ultima : comun).toFixed(DECIMALES),
  }))
}

export const JUEGO = {
  administradora: { razonSocial: 'Grupo Delta S.R.L.', cuit: '30-71234567-0' },
  consorcios: [
    {
      nombre: 'Mitre 456',
      direccion: 'Bartolome Mitre 456',
      localidad: 'Rosario',
      cuit: '33-70000012-9',
      unidades: doceUnidades(),
    },
    {
      nombre: 'San Martin 7890',
      direccion: 'San Martin 7890',
      localidad: 'Rosario',
      cuit: '33-70000096-9',
      unidades: noventaYSeisUnidades(),
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
