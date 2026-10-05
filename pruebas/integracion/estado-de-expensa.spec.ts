import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { misExpensas } from '@/aplicacion/liquidacion/ver-expensa'
import { registrarPago } from '@/aplicacion/pagos/registrar'
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
 * El estado de cobro de **una** expensa, que es lo que el consorcista mira al
 * entrar a Expensas (`CU-06`, `RF-08`).
 *
 * Sale de la imputacion, no de un campo: una expensa esta paga cuando lo
 * imputado alcanza su total, y vencida cuando queda saldo y el vencimiento ya
 * paso. Por eso se prueba contra pagos reales -- `registrarPago` imputa-- y no
 * escribiendo imputaciones a mano.
 */

const repo = repositorioHabilitaciones
// Las liquidaciones de agosto vencen el 12/09: el reloj queda despues, asi que
// lo impago ya esta vencido salvo que se diga lo contrario.
const RELOJ = relojFijo('2026-09-20T12:00:00Z')

const almacenDoble: AlmacenObjetos = {
  async emitirPermisoDeSubida(clave) {
    return { clave, credencial: 'x', vence: new Date() }
  },
  async guardar() {},
  async resolverLecturaAutorizada(clave) {
    return `https://almacen.test/${clave}`
  },
  async eliminar() {},
}

const UNIDADES = [
  { designacion: '1A', coeficiente: '50.00000000' },
  { designacion: '1B', coeficiente: '50.00000000' },
]

let consorcioId: string
let administrador: string
let rubroId: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Alvear 100')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')

  const rubro = await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Rubro de prueba' },
    update: {},
    create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
  })
  rubroId = rubro.id

  await cargarPadron(repo, RELOJ, { usuarioId: administrador, consorcioId, unidades: UNIDADES })
})

afterEach(async () => {
  // `limpiar` ya borra pagos, imputaciones, liquidaciones, ocupaciones y
  // unidades **en orden**; repetirlo acá con SQL crudo las borraría antes que
  // las reservas que las referencian. Lo único que no alcanza es la
  // notificación que deja la emisión.
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await limpiar()
})

/** Emite el mes indicado sobre el padron de dos unidades y devuelve sus detalles. */
async function emitir(mes: number) {
  const { periodoId } = await periodoPara(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes,
  })
  // Sin gasto la liquidacion sale en cero y cualquier pago la deja saldada:
  // el estado solo se puede distinguir sobre importes de verdad.
  await registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId,
    importe: '40000.00',
    fecha: new Date(`2026-${String(mes).padStart(2, '0')}-10`),
    descripcion: 'Limpieza',
  })
  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
  const emitida = await liquidarPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
  })

  return prismaBase.detalleLiquidacion.findMany({
    where: { liquidacionId: emitida.liquidacionId },
    include: { unidad: true },
  })
}

describe('estado de cobro de la expensa (CU-06)', () => {
  it('distingue pagada, vencida y pendiente sobre las expensas de quien ocupa', async () => {
    // Dos meses: agosto ya vencido (12/09) y septiembre todavia no (12/10).
    const agosto = await emitir(8)
    const septiembre = await emitir(9)

    const miaEnAgosto = agosto.find((d) => d.unidad.designacion === '1A')!
    const miaEnSeptiembre = septiembre.find((d) => d.unidad.designacion === '1A')!
    const ajena = agosto.find((d) => d.unidad.designacion === '1B')!

    const vecina = await crearUsuario('Nadia')
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: miaEnAgosto.unidadId,
      personaId: vecina.personaId,
      tipo: 'propietario',
      desde: new Date('2026-01-01'),
    })

    // Paga agosto entero. Septiembre queda impago pero todavia no vencido.
    await registrarPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: miaEnAgosto.unidadId,
      importe: miaEnAgosto.totalUnidad.toFixed(2),
      fechaPago: new Date('2026-09-05'),
      medio: 'transferencia',
    })

    const [unidad, ...otras] = await misExpensas(almacenDoble, repo, RELOJ, {
      usuarioId: vecina.id,
      consorcioId,
    })

    // Solo ve la suya: la ajena no entra ni con otro estado (regla RN-12).
    expect(otras).toHaveLength(0)
    expect(unidad.designacion).toBe('1A')
    expect(unidad.expensas.map((e) => e.detalleId)).not.toContain(ajena.id)

    const porDetalle = new Map(unidad.expensas.map((e) => [e.detalleId, e]))
    expect(porDetalle.get(miaEnAgosto.id)?.estadoPago).toBe('pagada')
    expect(porDetalle.get(miaEnAgosto.id)?.saldo).toBe('0.00')
    expect(porDetalle.get(miaEnSeptiembre.id)?.estadoPago).toBe('pendiente')
    expect(porDetalle.get(miaEnSeptiembre.id)?.saldo).toBe(miaEnSeptiembre.totalUnidad.toFixed(2))
  })

  it('un pago parcial sobre una expensa vencida la deja vencida, con el saldo que falta', async () => {
    const agosto = await emitir(8)
    const mia = agosto.find((d) => d.unidad.designacion === '1A')!

    const vecina = await crearUsuario('Nadia')
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: mia.unidadId,
      personaId: vecina.personaId,
      tipo: 'propietario',
      desde: new Date('2026-01-01'),
    })

    await registrarPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: mia.unidadId,
      importe: '1000.00',
      fechaPago: new Date('2026-09-05'),
      medio: 'efectivo',
    })

    const [unidad] = await misExpensas(almacenDoble, repo, RELOJ, {
      usuarioId: vecina.id,
      consorcioId,
    })
    const expensa = unidad.expensas.find((e) => e.detalleId === mia.id)!

    expect(expensa.estadoPago).toBe('vencida')
    // Al centavo: el saldo es el total menos lo imputado, no un redondeo.
    expect(expensa.saldo).toBe(mia.totalUnidad.minus(1000).toFixed(2))
  })
  /**
   * La imputacion revertida no descuenta. Se escribe `revertidaEn` directo
   * porque el unico camino que las revierte -anular la liquidacion- la deja
   * fuera de `misExpensas`, que solo mira las vigentes: la unica forma de fijar
   * el filtro es ponerlo a mano. Sin el, un pago revertido deja la expensa
   * diciendo «Pagada» sobre una deuda viva.
   */
  it('una imputacion revertida no cuenta: la expensa vuelve a deber', async () => {
    const agosto = await emitir(8)
    const mia = agosto.find((d) => d.unidad.designacion === '1A')!

    const vecina = await crearUsuario('Nadia')
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: mia.unidadId,
      personaId: vecina.personaId,
      tipo: 'propietario',
      desde: new Date('2026-01-01'),
    })

    await registrarPago(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: mia.unidadId,
      importe: mia.totalUnidad.toFixed(2),
      fechaPago: new Date('2026-09-05'),
      medio: 'transferencia',
    })

    const comoPagada = await misExpensas(almacenDoble, repo, RELOJ, {
      usuarioId: vecina.id,
      consorcioId,
    })
    expect(comoPagada[0].expensas.find((e) => e.detalleId === mia.id)?.estadoPago).toBe('pagada')

    await prismaBase.pagoImputacion.updateMany({
      where: { detalleLiquidacionId: mia.id },
      data: { revertidaEn: new Date('2026-09-10') },
    })

    const [unidad] = await misExpensas(almacenDoble, repo, RELOJ, {
      usuarioId: vecina.id,
      consorcioId,
    })
    const expensa = unidad.expensas.find((e) => e.detalleId === mia.id)!

    expect(expensa.estadoPago).toBe('vencida')
    expect(expensa.saldo).toBe(mia.totalUnidad.toFixed(2))
  })
})
