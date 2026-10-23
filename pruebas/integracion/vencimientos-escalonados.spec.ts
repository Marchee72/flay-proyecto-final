import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ErrorDeAplicacion, RolInsuficiente } from '@/compartido/errores'
import {
  guardarReglaVencimientos,
  verReglaVencimientos,
} from '@/aplicacion/consorcios/regla-vencimientos'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { periodoPara } from '@/aplicacion/periodos/periodos'
import { registrarPago } from '@/aplicacion/pagos/registrar'
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
 * US1 de la nota #3 (RF-08): configurar la regla de vencimientos del consorcio.
 * Lo que la base impone (unicidad por orden) no se prueba aca; esto es que el
 * caso de uso autorice, aisle, valide y audite.
 */

const RELOJ = relojFijo('2026-11-05T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let consorcista: string
let ajeno: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  // crearConsorcio deja tasaMoraMensual '2.0000' y diaVencimiento 10.
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  consorcista = (await crearUsuario('Beto')).id
  ajeno = (await crearUsuario('Cora')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(consorcista, consorcioId, 'consorcista')
})

afterEach(async () => {
  await limpiar()
})

const reglaValida = [
  { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
  { orden: 2, diaDelMes: 20, recargoPorcentaje: '1.0000' },
  { orden: 3, diaDelMes: 28, recargoPorcentaje: '1.5000' },
]

describe('regla de vencimientos escalonados (RF-08)', () => {
  it('guarda una regla valida y la devuelve', async () => {
    await guardarReglaVencimientos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      tramos: reglaValida,
    })

    const regla = await verReglaVencimientos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })

    expect(regla.porOmision).toBe(false)
    expect(regla.tramos).toHaveLength(3)
    expect(regla.tramos[2]).toMatchObject({ orden: 3, diaDelMes: 28, recargoPorcentaje: '1.5000' })
  })

  it('un consorcio sin regla devuelve el equivalente por omision (un vencimiento)', async () => {
    const regla = await verReglaVencimientos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(regla.porOmision).toBe(true)
    expect(regla.tramos).toEqual([{ orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' }])
  })

  it('rechaza una regla cuyo ultimo recargo iguala o supera la mora', async () => {
    await expect(
      guardarReglaVencimientos(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        tramos: [
          { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
          { orden: 2, diaDelMes: 20, recargoPorcentaje: '2.0000' }, // = mora 2 %
        ],
      }),
    ).rejects.toBeInstanceOf(ErrorDeAplicacion)

    // Nada quedo persistido.
    const regla = await verReglaVencimientos(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(regla.porOmision).toBe(true)
  })

  it('un consorcista no puede configurar la regla', async () => {
    await expect(
      guardarReglaVencimientos(repo, RELOJ, {
        usuarioId: consorcista,
        consorcioId,
        tramos: reglaValida,
      }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('un usuario sin habilitacion sobre el consorcio no ve la regla', async () => {
    await expect(
      verReglaVencimientos(repo, RELOJ, { usuarioId: ajeno, consorcioId }),
    ).rejects.toBeInstanceOf(ErrorDeAplicacion)
  })

  it('guardar la regla deja asiento en la bitacora (RN-15)', async () => {
    const antes = await prismaBase.bitacoraAuditoria.count({ where: { tabla: 'TramoVencimiento' } })
    await guardarReglaVencimientos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      tramos: reglaValida,
    })
    const despues = await prismaBase.bitacoraAuditoria.count({
      where: { tabla: 'TramoVencimiento' },
    })
    expect(despues).toBeGreaterThan(antes)
  })
})

describe('cobro con recargo escalonado (RF-08, US2)', () => {
  let unidadA: string

  // Regla 0/1/1.5 % a los dias 10/20/28 (mora del consorcio 2 % > 1.5 %).
  // Un gasto de 1000 sobre una unidad al 100 %: 1A debe 1000; la liquidacion del
  // periodo 01/2026 vence los 10/20/28 de 02/2026.
  beforeEach(async () => {
    await guardarReglaVencimientos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      tramos: [
        { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
        { orden: 2, diaDelMes: 20, recargoPorcentaje: '1.0000' },
        { orden: 3, diaDelMes: 28, recargoPorcentaje: '1.5000' },
      ],
    })
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [{ designacion: '1A', coeficiente: '100.00000000' }],
    })
    unidadA = (
      await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId, designacion: '1A' } })
    ).id

    const rubroId = (
      await prismaBase.rubroGasto.upsert({
        where: { nombre: 'Rubro de prueba' },
        update: {},
        create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
      })
    ).id
    const { periodoId } = await periodoPara(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes: 1,
    })
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId,
      importe: '1000.00',
      fecha: new Date('2026-01-05'),
      descripcion: 'Gasto enero',
    })
    await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
    await liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  })

  const pagarEl = (fecha: string, importePagado: string) =>
    registrarPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidadA,
      importe: importePagado,
      fechaPago: new Date(fecha),
      medio: 'transferencia',
    })

  it('congela los tres vencimientos al emitir', async () => {
    const liquidacion = await prismaBase.liquidacion.findFirstOrThrow({ where: { consorcioId } })
    const vencimientos = await prismaBase.vencimientoLiquidacion.findMany({
      where: { liquidacionId: liquidacion.id },
      orderBy: { orden: 'asc' },
    })
    expect(vencimientos.map((v) => v.fecha.toISOString().slice(0, 10))).toEqual([
      '2026-02-10',
      '2026-02-20',
      '2026-02-28',
    ])
    // El ultimo tramo fija el vencimiento en firme de la liquidacion.
    expect(liquidacion.vencimiento.toISOString().slice(0, 10)).toBe('2026-02-28')
  })

  it('pagar dentro del 2º tramo salda la expensa y cobra el recargo aparte', async () => {
    // El 15/02 rige el tramo 2 (1 %): exigible 1010 = 1000 + 10.
    const pago = await pagarEl('2026-02-15', '1010.00')

    expect(pago.imputaciones).toHaveLength(1)
    expect(pago.imputaciones[0]).toMatchObject({
      importeImputado: '1000.00',
      recargoCobrado: '10.00',
    })
    expect(pago.saldoAFavor).toBe('0.00')

    const imputacion = await prismaBase.pagoImputacion.findFirstOrThrow({
      where: { pagoId: pago.pagoId },
    })
    expect(imputacion.recargoCobrado.toFixed(2)).toBe('10.00')
  })

  it('pagar solo el importe base dentro de un tramo con recargo deja saldo pendiente', async () => {
    const pago = await pagarEl('2026-02-15', '1000.00')
    // No alcanza para base + recargo: el capital imputado es menor a 1000.
    expect(Number(pago.imputaciones[0]!.importeImputado)).toBeLessThan(1000)
  })
})

describe('vencimiento en firme, arrastre y congelado (RF-08, US3/US4)', () => {
  let rubroId: string

  beforeEach(async () => {
    await guardarReglaVencimientos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      tramos: [
        { orden: 1, diaDelMes: 10, recargoPorcentaje: '0.0000' },
        { orden: 2, diaDelMes: 20, recargoPorcentaje: '1.0000' },
        { orden: 3, diaDelMes: 28, recargoPorcentaje: '1.5000' },
      ],
    })
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [{ designacion: '1A', coeficiente: '100.00000000' }],
    })
    rubroId = (
      await prismaBase.rubroGasto.upsert({
        where: { nombre: 'Rubro de prueba' },
        update: {},
        create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
      })
    ).id
  })

  async function emitirMes(mes: number) {
    const { periodoId } = await periodoPara(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      anio: 2026,
      mes,
    })
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId,
      importe: '1000.00',
      fecha: new Date(`2026-${String(mes).padStart(2, '0')}-05`),
      descripcion: `Gasto ${mes}`,
    })
    await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
    return liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  }

  it('impaga tras el ultimo vencimiento: arrastra el base (no el recargado) y la mora corre sobre el base', async () => {
    await emitirMes(1) // vence 10/20/28 de 02/2026; queda impaga
    const febrero = await emitirMes(2)

    const detalle = await prismaBase.detalleLiquidacion.findFirstOrThrow({
      where: { liquidacionId: febrero.liquidacionId },
    })
    // El arrastre es el base 1000, no 1015 (1,5 %): el recargo del mes no se traslada.
    expect(detalle.deudaAnterior.toFixed(2)).toBe('1000.00')
    // La mora (2 % mensual del consorcio) corre sobre el base arrastrado.
    expect(Number(detalle.interesMora)).toBeGreaterThan(0)
  })

  it('cambiar la regla del consorcio no altera una liquidacion ya emitida (congelado)', async () => {
    const enero = await emitirMes(1)

    // Se cambia la regla a un solo vencimiento sin recargo.
    await guardarReglaVencimientos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      tramos: [{ orden: 1, diaDelMes: 15, recargoPorcentaje: '0.0000' }],
    })

    const vencimientos = await prismaBase.vencimientoLiquidacion.findMany({
      where: { liquidacionId: enero.liquidacionId },
      orderBy: { orden: 'asc' },
    })
    // La liquidacion de enero conserva sus tres tramos originales.
    expect(vencimientos).toHaveLength(3)
    expect(vencimientos.map((v) => v.recargoPorcentaje.toFixed(4))).toEqual([
      '0.0000',
      '1.0000',
      '1.5000',
    ])
  })
})
