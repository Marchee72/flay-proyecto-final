import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { PeriodoNoAdmiteGastos } from '@/dominio/periodos/estado'
import { editarGasto, eliminarGasto, GastoConVinculos } from '@/aplicacion/gastos/editar-gasto'
import { ImporteInvalido, registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
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

/** Editar y eliminar un gasto con el periodo abierto (RF-04, A4). */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let consorcista: string
let rubroId: string
let periodoId: string
let gastoId: string

const edicion = (sobre: Partial<Parameters<typeof editarGasto>[2]> = {}) => ({
  usuarioId: administrador,
  consorcioId,
  gastoId,
  rubroId,
  clasificacion: 'ordinario' as const,
  proveedorId: null,
  importe: '2500.50',
  fecha: new Date('2026-09-06'),
  descripcion: 'Factura corregida',
  ...sobre,
})

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  consorcista = (await crearUsuario('Carla')).id
  await habilitarEnConsorcio(consorcista, consorcioId, 'consorcista')

  rubroId = (
    await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro ordinario de prueba' },
      update: {},
      create: { nombre: 'Rubro ordinario de prueba', clasificacion: 'ordinario' },
    })
  ).id
  periodoId = (
    await periodoPara(repo, RELOJ, { usuarioId: administrador, consorcioId, anio: 2026, mes: 9 })
  ).periodoId
  gastoId = (
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId,
      importe: '1000.00',
      fecha: new Date('2026-09-05'),
      descripcion: 'Factura',
    })
  ).gastoId
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Comprobante"`
  await prismaBase.$executeRaw`DELETE FROM "Gasto"`
  await prismaBase.$executeRaw`DELETE FROM "Periodo"`
  await limpiar()
})

describe('editar un gasto (RF-04)', () => {
  it('editar un gasto del período abierto cambia el importe y deja rastro en la bitácora', async () => {
    await editarGasto(repo, RELOJ, edicion())

    const gasto = await prismaBase.gasto.findUniqueOrThrow({ where: { id: gastoId } })
    expect(gasto.importe.toFixed(2)).toBe('2500.50')
    expect(gasto.descripcion).toBe('Factura corregida')

    // La bitácora no se limpia: se acota a la clave de este gasto.
    const asientos = await prismaBase.$queryRaw<{ operacion: string }[]>`
      SELECT operacion::text FROM "BitacoraAuditoria"
      WHERE tabla = 'Gasto' AND clave = ${gastoId} AND operacion::text = 'MODIFICA'
    `
    expect(asientos).toHaveLength(1)
  })

  it('editar un gasto de un período liquidado se rechaza', async () => {
    await prismaBase.$executeRaw`UPDATE "Periodo" SET estado = 'liquidado' WHERE id = ${periodoId}::uuid`
    await expect(editarGasto(repo, RELOJ, edicion())).rejects.toBeInstanceOf(PeriodoNoAdmiteGastos)
  })

  it('editar con importe 0 se rechaza', async () => {
    await expect(editarGasto(repo, RELOJ, edicion({ importe: '0' }))).rejects.toBeInstanceOf(
      ImporteInvalido,
    )
  })

  it('un consorcista no puede editar', async () => {
    await expect(
      editarGasto(repo, RELOJ, edicion({ usuarioId: consorcista })),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('un gasto de otro consorcio es no encontrado', async () => {
    const otro = (await crearConsorcio((await crearAdministradora('Otra')).id, 'Sarmiento 1')).id
    await habilitarEnConsorcio(administrador, otro, 'administrador')
    await expect(editarGasto(repo, RELOJ, edicion({ consorcioId: otro }))).rejects.toBeInstanceOf(
      NoEncontrado,
    )
  })
})

describe('eliminar un gasto (RF-04)', () => {
  const eliminar = () =>
    eliminarGasto(repo, RELOJ, { usuarioId: administrador, consorcioId, gastoId })

  it('eliminar un gasto sin vínculos lo borra', async () => {
    expect(await eliminar()).toEqual({ periodoId })
    expect(await prismaBase.gasto.count({ where: { id: gastoId } })).toBe(0)
  })

  it('eliminar un gasto con comprobante se rechaza', async () => {
    await prismaBase.comprobante.create({
      data: { gastoId, claveObjeto: 'k/1', tipoContenido: 'application/pdf', bytes: 10 },
    })
    await expect(eliminar()).rejects.toBeInstanceOf(GastoConVinculos)
    expect(await prismaBase.gasto.count({ where: { id: gastoId } })).toBe(1)
  })
})
