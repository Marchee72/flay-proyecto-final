import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { verBandeja } from '@/aplicacion/pendientes/bandeja'
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
 * La bandeja cruza consorcios y por eso sale de la extension de aislamiento
 * (diseno 2026-09-13 § 4.3). La prueba que importa es la de RT-04: dos
 * consorcios en paralelo y cada administrador ve solo lo suyo.
 */
const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioA: string
let consorcioB: string
let adminDeA: string
let adminDeAmbos: string
let consorcista: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioA = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  consorcioB = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  adminDeA = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(adminDeA, consorcioA, 'administrador')
  adminDeAmbos = (await crearUsuario('Bea')).id
  await habilitarEnConsorcio(adminDeAmbos, consorcioA, 'administrador')
  await habilitarEnConsorcio(adminDeAmbos, consorcioB, 'administrador')
  consorcista = (await crearUsuario('Caro')).id
  await habilitarEnConsorcio(consorcista, consorcioA, 'consorcista')

  for (const [consorcioId, titulo] of [
    [consorcioA, 'Gotera en el palier'],
    [consorcioB, 'Ascensor detenido'],
  ] as const) {
    await prismaBase.reclamo.create({
      data: { consorcioId, creadoPor: adminDeAmbos, titulo, descripcion: '-', urgencia: 'alta' },
    })
    await prismaBase.periodo.create({ data: { consorcioId, anio: 2026, mes: 8 } })
  }
  // Uno resuelto: no es pendiente de nadie.
  await prismaBase.reclamo.create({
    data: {
      consorcioId: consorcioA,
      creadoPor: adminDeAmbos,
      titulo: 'Ya arreglado',
      descripcion: '-',
      estado: 'resuelto',
      responsableId: adminDeAmbos,
      fechaResolucion: new Date(),
    },
  })
})

afterEach(limpiar)

describe('bandeja global', () => {
  it('cada administrador ve solo los consorcios que administra (RT-04)', async () => {
    const deA = await verBandeja(repo, RELOJ, { usuarioId: adminDeA })
    expect(deA.consorcios.map((c) => c.nombre)).toEqual(['Mitre 456'])
    expect(deA.consorcios[0].reclamos.map((r) => r.titulo)).toEqual(['Gotera en el palier'])
    expect(deA.consorcios[0].periodosAbiertos).toEqual(['08/2026'])

    const deAmbos = await verBandeja(repo, RELOJ, { usuarioId: adminDeAmbos })
    expect(deAmbos.consorcios.map((c) => c.nombre)).toEqual(['Mitre 456', 'San Martin 7890'])
    expect(deAmbos.consorcios[1].reclamos.map((r) => r.titulo)).toEqual(['Ascensor detenido'])
  })

  it('el consorcista no tiene bandeja: lista vacia, sin lanzar', async () => {
    const vacia = await verBandeja(repo, RELOJ, { usuarioId: consorcista })
    expect(vacia.consorcios).toEqual([])
    expect(vacia.cola).toBeNull()
  })
})
