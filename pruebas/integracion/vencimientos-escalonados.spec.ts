import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ErrorDeAplicacion, RolInsuficiente } from '@/compartido/errores'
import {
  guardarReglaVencimientos,
  verReglaVencimientos,
} from '@/aplicacion/consorcios/regla-vencimientos'
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
