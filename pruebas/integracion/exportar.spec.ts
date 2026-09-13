import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { celdaCsv, filaCsv } from '@/compartido/csv'
import { importe } from '@/compartido/dinero'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { encabezadoCsv, paginaExportada } from '@/aplicacion/exportar/exportar'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { registrarPago } from '@/aplicacion/pagos/registrar'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * Exportacion abierta (`FR-032b`, SC-018): el CSV de un consorcio suma, en
 * `Decimal`, lo mismo que su liquidacion; el de otro consorcio es «no
 * encontrado»; el consorcista no exporta; los importes viajan como cadena.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let otroConsorcioId: string
let administrador: string
let vecino: string
let liquidacionId: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  vecino = (await crearUsuario('Beto')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
  const rubro = await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Rubro de prueba' },
    update: {},
    create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
  })
  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', coeficiente: '33.33333333' },
      { designacion: '1B', coeficiente: '33.33333333' },
      { designacion: '1C', coeficiente: '33.33333334' },
    ],
  })
  const { periodoId } = await abrirPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes: 1,
  })
  for (const [i, valor] of ['1000.00', '333.33', '0.01'].entries()) {
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId: rubro.id,
      importe: valor,
      fecha: new Date('2026-01-15'),
      descripcion: `Gasto ${i}; con "comillas"`,
    })
  }
  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  liquidacionId = (
    await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  ).liquidacionId
  const unidad = await prismaBase.unidad.findFirstOrThrow({
    where: { consorcioId, designacion: '1A' },
  })
  await registrarPago(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidad.id,
    importe: '200.00',
    fechaPago: new Date('2026-02-05'),
    medio: 'transferencia',
    referencia: 'ref;1',
  })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "PagoImputacion"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Pago"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

/** Todas las paginas, de a `tamano`, como filas de celdas. */
async function exportar(tabla: 'gastos' | 'liquidaciones' | 'pagos', tamano = 2) {
  const filas: string[][] = []
  let despuesDe: string | null = null
  let paginas = 0
  do {
    const pagina = await paginaExportada(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      tabla,
      despuesDe,
      tamano,
    })
    paginas++
    for (const linea of pagina.lineas) filas.push(desarmar(linea))
    despuesDe = pagina.siguiente
  } while (despuesDe)
  return { filas, paginas, encabezado: desarmar(encabezadoCsv(tabla)) }
}

/** Lector minimo de una linea CSV con `;` y comillas dobladas, para la prueba. */
function desarmar(linea: string): string[] {
  const celdas: string[] = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (entreComillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"'
        i++
      } else if (c === '"') entreComillas = false
      else actual += c
    } else if (c === '"') entreComillas = true
    else if (c === ';') {
      celdas.push(actual)
      actual = ''
    } else if (c === '\r' || c === '\n') break
    else actual += c
  }
  celdas.push(actual)
  return celdas
}

describe('csv', () => {
  it('escapa comillas, separador y saltos; deja lo demas crudo', () => {
    expect(celdaCsv('1000.00')).toBe('1000.00')
    expect(celdaCsv('a;b')).toBe('"a;b"')
    expect(celdaCsv('di "hola"')).toBe('"di ""hola"""')
    expect(celdaCsv(null)).toBe('')
    expect(filaCsv(['x', null, 'y\nz'])).toBe('x;;"y\nz"\r\n')
  })
})

describe('exportacion abierta', () => {
  it('el CSV de gastos suma en Decimal lo mismo que la liquidacion, con paginado y escape', async () => {
    const { filas, paginas, encabezado } = await exportar('gastos')
    expect(paginas).toBe(2)
    expect(filas).toHaveLength(3)
    const importeEn = encabezado.indexOf('importe')
    const total = filas.reduce((suma, f) => suma.plus(importe(f[importeEn])), importe('0'))
    const liquidacion = await prismaBase.liquidacion.findUniqueOrThrow({
      where: { id: liquidacionId },
    })
    expect(total.toFixed(2)).toBe(liquidacion.totalGeneral.toFixed(2))
    expect(total.toFixed(2)).toBe('1333.34')
    // El texto con punto y coma y comillas vuelve entero.
    expect(filas.map((f) => f[encabezado.indexOf('descripcion')])).toContain(
      'Gasto 0; con "comillas"',
    )
  })

  it('el CSV de liquidaciones cierra al centavo contra el total general', async () => {
    const { filas, encabezado } = await exportar('liquidaciones')
    expect(filas).toHaveLength(3)
    const col = (nombre: string) => encabezado.indexOf(nombre)
    const suma = filas.reduce(
      (acumulado, f) =>
        acumulado
          .plus(importe(f[col('importe_ordinario')]))
          .plus(importe(f[col('importe_extraordinario')]))
          .plus(importe(f[col('ajuste_redondeo')])),
      importe('0'),
    )
    expect(suma.toFixed(2)).toBe('1333.34')
    expect(filas.map((f) => f[col('unidad')])).toEqual(['1A', '1B', '1C'])
    expect(filas[0][col('periodo')]).toBe('2026-01')
  })

  it('el CSV de pagos lleva importe como cadena y la referencia escapada', async () => {
    const { filas, encabezado } = await exportar('pagos')
    expect(filas).toHaveLength(1)
    expect(filas[0][encabezado.indexOf('importe')]).toBe('200.00')
    expect(filas[0][encabezado.indexOf('referencia')]).toBe('ref;1')
    expect(filas[0][encabezado.indexOf('unidad')]).toBe('1A')
  })

  it('otro consorcio es no encontrado y el consorcista no exporta', async () => {
    await expect(
      paginaExportada(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId: otroConsorcioId,
        tabla: 'gastos',
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    await expect(
      paginaExportada(repo, RELOJ, { usuarioId: vecino, consorcioId, tabla: 'gastos' }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })
})
