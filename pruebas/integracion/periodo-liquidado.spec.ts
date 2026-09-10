import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RolInsuficiente } from '@/compartido/errores'
import { PeriodoNoAdmiteGastos } from '@/dominio/periodos/estado'
import { ImporteInvalido, registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { abrirPeriodo, listarPeriodos, PeriodoRepetido } from '@/aplicacion/periodos/periodos'
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
 * SC-012 y regla RN-03: un periodo que ya se liquido no admite un gasto mas.
 *
 * Esta etapa no liquida —cerrar y liquidar son alcance de `003`—, asi que el
 * estado se pone a mano con una consulta cruda. Es a proposito: la prueba
 * verifica **la regla**, no el camino que en la etapa siguiente la va a
 * producir, y usa el contrato compartido en vez de inventar un estado propio.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let consorcista: string
let rubroId: string
let periodoId: string

const registrar = (quien = administrador, periodo = periodoId) =>
  registrarGasto(repo, RELOJ, {
    usuarioId: quien,
    consorcioId,
    periodoId: periodo,
    rubroId,
    importe: '15000.00',
    fecha: new Date('2026-09-05'),
    descripcion: 'Factura',
  })

const ponerEstado = (estado: string) =>
  prismaBase.$executeRawUnsafe(
    `UPDATE "Periodo" SET estado = '${estado}'::"EstadoPeriodo" WHERE id = $1::uuid`,
    periodoId,
  )

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  consorcista = (await crearUsuario('Beto')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(consorcista, consorcioId, 'consorcista')

  rubroId = (
    await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro de prueba' },
      update: {},
      create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
    })
  ).id

  periodoId = (
    await abrirPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, anio: 2026, mes: 9 })
  ).periodoId
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Gasto"`
  await prismaBase.$executeRaw`DELETE FROM "Periodo"`
  await limpiar()
})

describe('apertura de periodos (FR-024)', () => {
  it('no deja abrir dos veces el mismo mes, y lo dice', async () => {
    await expect(
      abrirPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, anio: 2026, mes: 9 }),
    ).rejects.toBeInstanceOf(PeriodoRepetido)

    await expect(
      abrirPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, anio: 2026, mes: 9 }),
    ).rejects.toThrow(/9\/2026/)
  })

  it('un consorcista no abre periodos (SC-002b)', async () => {
    await expect(
      abrirPeriodo(repo, RELOJ, { usuarioId: consorcista, consorcioId, anio: 2026, mes: 10 }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('el listado cuenta los gastos de cada mes', async () => {
    await registrar()

    const periodos = await listarPeriodos(repo, RELOJ, { usuarioId: administrador, consorcioId })

    expect(periodos).toHaveLength(1)
    expect(periodos[0]).toMatchObject({ anio: 2026, mes: 9, estado: 'abierto', gastos: 1 })
  })
})

describe('gastos y estado del periodo (regla RN-03, SC-012)', () => {
  it('con el periodo abierto, el gasto entra y congela la clasificacion del rubro', async () => {
    const { gastoId } = await registrar()

    const gasto = await prismaBase.gasto.findUniqueOrThrow({ where: { id: gastoId } })
    expect(gasto.clasificacion).toBe('ordinario')
    expect(gasto.importe.toFixed(2)).toBe('15000.00')
    expect(gasto.cargadoPor).toBe(administrador)
  })

  it('reclasificar el rubro despues **no** cambia el gasto ya registrado (regla RN-04)', async () => {
    const { gastoId } = await registrar()

    await prismaBase.rubroGasto.update({
      where: { id: rubroId },
      data: { clasificacion: 'extraordinario' },
    })

    const gasto = await prismaBase.gasto.findUniqueOrThrow({ where: { id: gastoId } })
    expect(gasto.clasificacion).toBe('ordinario')

    await prismaBase.rubroGasto.update({
      where: { id: rubroId },
      data: { clasificacion: 'ordinario' },
    })
  })

  it('un periodo liquidado rechaza el alta en el 100 % de los intentos (SC-012)', async () => {
    await ponerEstado('liquidado')

    for (let intento = 0; intento < 5; intento++) {
      await expect(registrar()).rejects.toBeInstanceOf(PeriodoNoAdmiteGastos)
    }

    expect(await prismaBase.gasto.count()).toBe(0)
  })

  it('cerrado y anulado tampoco admiten gastos', async () => {
    for (const estado of ['cerrado', 'anulado']) {
      await ponerEstado(estado)
      await expect(registrar()).rejects.toBeInstanceOf(PeriodoNoAdmiteGastos)
    }
  })

  it('el rechazo dice el estado y que hacer, no un codigo (RNF-10)', async () => {
    await ponerEstado('liquidado')
    await expect(registrar()).rejects.toThrow(/liquidado/)
    await expect(registrar()).rejects.toThrow(/período siguiente/)
  })

  it('un consorcista no registra gastos (SC-002b)', async () => {
    await expect(registrar(consorcista)).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('un importe con mas de dos decimales se rechaza antes de escribir', async () => {
    await expect(
      registrarGasto(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        periodoId,
        rubroId,
        importe: '1500.005',
        fecha: new Date('2026-09-05'),
        descripcion: 'Factura',
      }),
    ).rejects.toBeInstanceOf(ImporteInvalido)

    expect(await prismaBase.gasto.count()).toBe(0)
  })

  it('el importe grande no pierde un centavo: entra y sale como cadena (SC-010)', async () => {
    const { gastoId } = await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId,
      importe: '999999999999.99',
      fecha: new Date('2026-09-05'),
      descripcion: 'Obra',
    })

    const gasto = await prismaBase.gasto.findUniqueOrThrow({ where: { id: gastoId } })
    expect(gasto.importe.toFixed(2)).toBe('999999999999.99')
  })
})

describe('auditoria de las tablas de esta historia (FR-025, SC-007)', () => {
  it('periodo y gasto dejan asiento con imagen posterior', async () => {
    const { gastoId } = await registrar()

    for (const [tabla, clave] of [
      ['Periodo', periodoId],
      ['Gasto', gastoId],
    ] as const) {
      const asientos = await prismaBase.bitacoraAuditoria.findMany({ where: { tabla, clave } })
      expect(asientos, `${tabla} sin asiento`).toHaveLength(1)
      expect(asientos[0].operacion).toBe('INSERTA')
      expect(asientos[0].posterior).not.toBeNull()
    }
  })
})
