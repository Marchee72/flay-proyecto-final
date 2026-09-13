import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Decimal } from '@/compartido/dinero'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import {
  verGastoPorRubro,
  verMorosidad,
  verPanel,
  verResolucionReclamos,
} from '@/aplicacion/indicadores/indicadores'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { registrarPago } from '@/aplicacion/pagos/registrar'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'
import {
  morosidadMensual,
  refrescarVistas,
  resolucionReclamos,
} from '@/infraestructura/repositorios/indicadores'

import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * Los indicadores contra las vistas materializadas (`FR-017` a `FR-021`,
 * SC-009, SC-011, SC-022): valores calculados a mano en la prueba, en
 * `Decimal` con tolerancia cero; aislamiento por consorcio; el consorcista no
 * entra; y la lectura sin consorcio activo lanza (research R-11).
 */

// Los periodos de enero a marzo vencen el 10 del mes siguiente: a mediados de
// septiembre los tres estan vencidos.
const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let otroConsorcioId: string
let administrador: string
let consorcista: string
let rubroId: string
let unidadA: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(administrador, otroConsorcioId, 'administrador')
  consorcista = (await crearUsuario('Beto')).id
  await habilitarEnConsorcio(consorcista, consorcioId, 'consorcista')

  rubroId = (
    await prismaBase.rubroGasto.upsert({
      where: { nombre: 'Rubro de prueba' },
      update: {},
      create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
    })
  ).id

  for (const id of [consorcioId, otroConsorcioId]) {
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: id,
      unidades: [
        { designacion: '1A', coeficiente: '50.00000000' },
        { designacion: '1B', coeficiente: '50.00000000' },
      ],
    })
  }
  unidadA = (
    await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId, designacion: '1A' } })
  ).id
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "PagoImputacion"`
  await prismaBase.$executeRaw`DELETE FROM "Pago"`
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
  await refrescarVistas()
})

/** Un mes con `importe` de gasto en un consorcio, emitido. */
async function emitirMes(enConsorcioId: string, mes: number, importe: string) {
  const { periodoId } = await abrirPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: enConsorcioId,
    anio: 2026,
    mes,
  })
  await registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: enConsorcioId,
    periodoId,
    rubroId,
    importe,
    fecha: new Date(`2026-${String(mes).padStart(2, '0')}-05`),
    descripcion: `Gasto ${mes}`,
  })
  await cerrarPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: enConsorcioId,
    periodoId,
  })
  return liquidarPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: enConsorcioId,
    periodoId,
  })
}

describe('I-1 morosidad (SC-009, SC-022)', () => {
  it('coincide con la cuenta a mano, en decimal y sin tolerancia', async () => {
    // Enero: 1000 → 500 por unidad; 1A paga 300, queda 200 impago. 1B no paga.
    await emitirMes(consorcioId, 1, '1000.00')
    await registrarPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: unidadA,
      importe: '300.00',
      fechaPago: new Date('2026-02-05'),
      medio: 'transferencia',
    })
    // Febrero: 2000 → 1000 por unidad, nadie paga. El interes de enero engorda 1A y 1B.
    await emitirMes(consorcioId, 2, '2000.00')
    // Otro consorcio con su propia deuda, para que el aislamiento tenga que trabajar.
    await emitirMes(otroConsorcioId, 1, '8000.00')

    await refrescarVistas()

    const { serie, alertas, meta } = await verMorosidad(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(serie).toHaveLength(2)
    const enero = serie[0]
    expect(enero.masaLiquidada).toBe('1000.00')
    expect(enero.deudaVencida).toBe(new Decimal('200').plus('500').toFixed(2))
    expect(enero.unidadesEnMora).toBe(2)
    // 700 / 1000 = 70.00 %, redondeado una vez en la vista.
    expect(enero.porcentaje).toBe('70.00')
    expect(meta).toBe('12')
    expect(alertas.map((a) => a.tipo)).toContain('morosidad_alta')

    // Febrero: cada unidad debe 1000 mas el interes de enero sobre su capital
    // impago. La masa incluye ese interes: lo que se liquido es lo que se debe.
    const febrero = serie[1]
    const detalles = await prismaBase.detalleLiquidacion.findMany({
      where: { liquidacion: { consorcioId, periodo: { mes: 2 } } },
    })
    const masaFebrero = detalles.reduce((t, d) => t.plus(d.totalUnidad.toFixed(2)), new Decimal(0))
    expect(febrero.masaLiquidada).toBe(masaFebrero.toFixed(2))
    expect(febrero.deudaVencida).toBe(masaFebrero.toFixed(2))
    expect(febrero.porcentaje).toBe('100.00')
  })

  it('un consorcio no ve la morosidad del otro, y sin consorcio activo la lectura lanza', async () => {
    await emitirMes(consorcioId, 1, '1000.00')
    await emitirMes(otroConsorcioId, 1, '8000.00')
    await refrescarVistas()

    const propia = await verMorosidad(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(propia.serie.map((m) => m.masaLiquidada)).toEqual(['1000.00'])
    const ajena = await verMorosidad(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId: otroConsorcioId,
    })
    expect(ajena.serie.map((m) => m.masaLiquidada)).toEqual(['8000.00'])

    await expect(morosidadMensual()).rejects.toThrow('No hay un consorcio seleccionado')
    // Con lista vacia no devuelve todo: devuelve nada.
    expect(await morosidadMensual([])).toEqual([])
  })

  it('el consorcista no accede a los indicadores (SC-011)', async () => {
    await expect(
      verMorosidad(repo, RELOJ, { usuarioId: consorcista, consorcioId }),
    ).rejects.toThrow('Tu rol no permite')
    await expect(verPanel(repo, RELOJ, { usuarioId: consorcista })).rejects.toThrow(
      'Tu rol no permite',
    )
  })
})

describe('I-2 gasto por rubro (FR-019)', () => {
  it('con menos de doce periodos el promedio movil es nulo: historia insuficiente, no desvio falso', async () => {
    for (const mes of [1, 2, 3]) await emitirMes(consorcioId, mes, `${mes}000.00`)
    await refrescarVistas()

    const { filas, alertas } = await verGastoPorRubro(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(filas.map((f) => f.importe)).toEqual(['1000.00', '2000.00', '3000.00'])
    expect(filas.every((f) => f.promedioMovil12 === null && f.historiaInsuficiente)).toBe(true)
    expect(filas.every((f) => !f.desviado)).toBe(true)
    expect(alertas.filter((a) => a.tipo === 'desvio_rubro')).toEqual([])
    expect(filas[2].periodosAnteriores).toBe(2)
  })
})

describe('I-4 resolucion de reclamos (FR-020)', () => {
  it('mediana y percentil 90 sobre horas conocidas', async () => {
    const apertura = new Date('2026-06-01T00:00:00Z')
    const horas = [10, 20, 100]
    for (const h of horas) {
      await prismaBase.reclamo.create({
        data: {
          consorcioId,
          creadoPor: administrador,
          titulo: `Reclamo ${h}`,
          descripcion: 'Prueba de tiempos de resolucion.',
          urgencia: 'alta',
          estado: 'resuelto',
          responsableId: administrador,
          rubroId,
          fechaApertura: apertura,
          fechaResolucion: new Date(apertura.getTime() + h * 3_600_000),
        },
      })
    }
    await refrescarVistas()

    const { filas, alertas } = await verResolucionReclamos(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
    })
    expect(filas).toHaveLength(1)
    expect(filas[0].cantidad).toBe(3)
    expect(filas[0].medianaHoras).toBe('20.0')
    // percentile_cont(0.9) sobre [10, 20, 100]: 20 + 0.8 * 80 = 84.
    expect(filas[0].p90Horas).toBe('84.0')
    expect(filas[0].fueraDeMeta).toBe(false)
    expect(alertas).toEqual([])

    const crudo = await enConsorcio(consorcioId, () => resolucionReclamos())
    expect(crudo[0].urgencia).toBe('alta')
  })
})
