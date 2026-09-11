import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Decimal } from '@/compartido/dinero'
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
 * RNF-07, SC-006: la liquidacion de un consorcio de **100 unidades** completa
 * en menos de 30 segundos, sobre cinco corridas consecutivas, contra la base
 * administrada. No cuenta la generacion de documentos, que es diferida.
 *
 * Corre con `npm run medir:liquidacion` y tambien dentro de la puerta: si un
 * cambio la empeora, se nota antes de integrar.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones
const LIMITE_MS = 30_000
const CORRIDAS = 5

/** Cien unidades iguales de 1 %: suman 100 sin sobrante. */
const CIEN_UNIDADES = Array.from({ length: 100 }, (_, i) => ({
  designacion: `${Math.floor(i / 4) + 1}${'ABCD'[i % 4]}`,
  coeficiente: new Decimal(1).toFixed(8),
}))

let consorcioId: string
let administrador: string
let periodoId: string

beforeAll(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Cien unidades')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')

  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: CIEN_UNIDADES,
  })

  const rubro = await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Rubro de prueba' },
    update: {},
    create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
  })

  periodoId = (
    await abrirPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, anio: 2026, mes: 8 })
  ).periodoId

  // Doce gastos, como un mes normal.
  for (let i = 0; i < 12; i++) {
    await registrarGasto(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      periodoId,
      rubroId: rubro.id,
      importe: `${(i + 1) * 12345}.67`,
      fecha: new Date('2026-08-10'),
      descripcion: `Gasto ${i + 1}`,
    })
  }

  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
})

afterAll(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

describe('RNF-07: liquidacion de 100 unidades', () => {
  it(
    `completa en menos de ${LIMITE_MS / 1000} s en ${CORRIDAS} corridas consecutivas`,
    async () => {
      const tiempos: number[] = []

      for (let corrida = 0; corrida < CORRIDAS; corrida++) {
        const inicio = performance.now()
        const emitida = await liquidarPeriodo(repo, RELOJ, {
          usuarioId: administrador,
          consorcioId,
          periodoId,
        })
        tiempos.push(Math.round(performance.now() - inicio))

        expect(emitida.unidades).toBe(100)

        // Se anula para poder volver a emitir: es el camino real de una
        // correccion, y de paso ejercita la reemision.
        await anularLiquidacion(repo, RELOJ, {
          usuarioId: administrador,
          consorcioId,
          liquidacionId: emitida.liquidacionId,
        })
      }

      console.log(`RNF-07 · 100 unidades · ms por corrida: ${tiempos.join(', ')}`)

      for (const ms of tiempos) expect(ms).toBeLessThan(LIMITE_MS)
    },
    LIMITE_MS * CORRIDAS + 60_000,
  )
})
