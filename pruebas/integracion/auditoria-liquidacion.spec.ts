import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { anularLiquidacion } from '@/aplicacion/liquidacion/anular'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
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
 * Auditoria de las tablas economicas de esta etapa (regla RN-15 § 7.2, SC-012).
 *
 * La bitacora **no se limpia** —`flay_app` no tiene `DELETE` sobre ella, y eso
 * es lo que SC-008 promete—, asi que cada prueba se acota a las filas de su
 * propia corrida por identificador.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

async function asientosDe(tabla: string, clave: string) {
  return prismaBase.bitacoraAuditoria.findMany({
    where: { tabla, clave },
    orderBy: { momento: 'asc' },
    select: { operacion: true, anterior: true, posterior: true },
  })
}

describe('la emision deja asiento de cada tabla economica (SC-012)', () => {
  it('una liquidacion y sus detalles dejan exactamente un asiento de alta cada uno', async () => {
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [
        { designacion: '1A', coeficiente: '50.00000000' },
        { designacion: '1B', coeficiente: '50.00000000' },
      ],
    })

    const rubro = await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro de prueba' },
      update: {},
      create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
    })

    const { periodoId } = await abrirPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes: 8,
    })

    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId: rubro.id,
      importe: '1000.00',
      fecha: new Date('2026-08-15'),
      descripcion: 'Gasto de agosto',
    })

    await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })

    const emitida = await liquidarPeriodo(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
    })

    const deLaLiquidacion = await asientosDe('Liquidacion', emitida.liquidacionId)
    expect(deLaLiquidacion).toHaveLength(1)
    expect(deLaLiquidacion[0].operacion).toBe('INSERTA')
    expect(deLaLiquidacion[0].anterior).toBeNull()
    expect(deLaLiquidacion[0].posterior).not.toBeNull()

    const detalles = await prismaBase.detalleLiquidacion.findMany({
      where: { liquidacionId: emitida.liquidacionId },
      select: { id: true },
    })

    for (const detalle of detalles) {
      const asientos = await asientosDe('DetalleLiquidacion', detalle.id)
      expect(asientos).toHaveLength(1)
      expect(asientos[0].operacion).toBe('INSERTA')
    }

    // Anular es una modificacion, y tiene que dejar su propio asiento con la
    // imagen anterior: es lo que permite reconstruir que estaba vigente.
    await anularLiquidacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      liquidacionId: emitida.liquidacionId,
    })

    const despues = await asientosDe('Liquidacion', emitida.liquidacionId)
    expect(despues).toHaveLength(2)
    expect(despues[1].operacion).toBe('MODIFICA')
    expect((despues[1].anterior as { estado: string }).estado).toBe('vigente')
    expect((despues[1].posterior as { estado: string }).estado).toBe('anulada')
  })

  it('la aplicacion no puede tocar la bitacora (SC-008, RNF-12)', async () => {
    await expect(
      prismaBase.$executeRaw`UPDATE "BitacoraAuditoria" SET usuario = 'impostor'`,
    ).rejects.toThrow(/permission denied/)

    await expect(prismaBase.$executeRaw`DELETE FROM "BitacoraAuditoria"`).rejects.toThrow(
      /permission denied/,
    )
  })
})
