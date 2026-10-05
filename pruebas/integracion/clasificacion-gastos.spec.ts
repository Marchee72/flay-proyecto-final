import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listarGastos } from '@/aplicacion/gastos/listar-gastos'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { periodoPara } from '@/aplicacion/periodos/periodos'
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
 * La clasificacion del gasto (regla RN-04): sale del rubro y quien carga la
 * puede corregir para **ese** gasto. Que quede congelada —reclasificar el rubro
 * no toca un gasto ya cargado— lo cubre `periodo-liquidado.spec.ts`.
 *
 * Importa porque decide el prorrateo: las ordinarias las paga el ocupante y las
 * extraordinarias el propietario (regla RN-05, Ley 27.551). Un gasto mal
 * clasificado le cobra a quien no corresponde.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let rubroOrdinario: string
let periodoId: string

const registrar = (
  importeGasto: string,
  rubroId = rubroOrdinario,
  clasificacion?: 'ordinario' | 'extraordinario',
) =>
  registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId,
    importe: importeGasto,
    fecha: new Date('2026-09-05'),
    descripcion: 'Factura',
    clasificacion,
  })

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')

  rubroOrdinario = (
    await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro ordinario de prueba' },
      update: {},
      create: { nombre: 'Rubro ordinario de prueba', clasificacion: 'ordinario' },
    })
  ).id

  periodoId = (
    await periodoPara(repo, RELOJ, { usuarioId: administrador, consorcioId, anio: 2026, mes: 9 })
  ).periodoId
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Gasto"`
  await prismaBase.$executeRaw`DELETE FROM "Periodo"`
  await limpiar()
})

describe('clasificacion del gasto (regla RN-04)', () => {
  it('sin indicar nada, se copia la del rubro', async () => {
    const { gastoId } = await registrar('1000.00')

    const gasto = await prismaBase.gasto.findUniqueOrThrow({ where: { id: gastoId } })
    expect(gasto.clasificacion).toBe('ordinario')
  })

  it('quien carga la corrige para ese gasto, sin tocar el rubro', async () => {
    const { gastoId } = await registrar('1000.00', rubroOrdinario, 'extraordinario')

    const gasto = await prismaBase.gasto.findUniqueOrThrow({ where: { id: gastoId } })
    expect(gasto.clasificacion).toBe('extraordinario')

    // El rubro sigue siendo ordinario: la correccion es del gasto, no del catalogo.
    const rubro = await prismaBase.rubroGasto.findUniqueOrThrow({ where: { id: rubroOrdinario } })
    expect(rubro.clasificacion).toBe('ordinario')
  })
})

describe('listado por clasificacion (RF-10)', () => {
  beforeEach(async () => {
    await registrar('1000.00')
    await registrar('250.50')
    await registrar('900000.00', rubroOrdinario, 'extraordinario')
  })

  it('los subtotales parten el total en dos, al centavo', async () => {
    const listado = await listarGastos(repo, RELOJ, { usuarioId: administrador, consorcioId })

    expect(listado.cantidad).toBe(3)
    expect(listado.total).toBe('901250.50')
    expect(listado.porClasificacion).toEqual({
      ordinario: '1250.50',
      extraordinario: '900000.00',
    })
  })

  it('el filtro acota las filas y el total, no solo la pagina', async () => {
    const listado = await listarGastos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      clasificacion: 'extraordinario',
    })

    expect(listado.cantidad).toBe(1)
    expect(listado.total).toBe('900000.00')
    expect(listado.gastos.map((gasto) => gasto.clasificacion)).toEqual(['extraordinario'])
  })
})
