import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { misUnidadesPorConsorcio } from '@/aplicacion/consorcios/mis-unidades-por-consorcio'
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

/** RF-03: la entrada con unidades en varios edificios lee las propias, consorcio por consorcio. */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')

let usuario: { id: string; personaId: string }
let a: string
let b: string

async function unidades(consorcioId: string, designaciones: string[]) {
  const filas = designaciones.map((designacion) => ({
    id: crypto.randomUUID(),
    consorcioId,
    designacion,
    coeficiente: (100 / designaciones.length).toFixed(8),
  }))
  await prismaBase.unidad.createMany({ data: filas })
  return filas.map((f) => f.id)
}

async function ocupar(unidadId: string, hasta: string | null = null) {
  await prismaBase.$executeRaw`
    INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia)
    VALUES (${unidadId}::uuid, ${usuario.personaId}::uuid, 'propietario'::"TipoOcupacion",
            daterange('2026-01-01', ${hasta}::date))`
}

const leer = () => misUnidadesPorConsorcio(repositorioHabilitaciones, RELOJ, usuario.id)

beforeEach(async () => {
  const administradora = await crearAdministradora()
  a = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  b = (await crearConsorcio(administradora.id, 'Sarmiento 789')).id
  usuario = await crearUsuario()
  await habilitarEnConsorcio(usuario.id, a, 'consorcista')
  for (const id of await unidades(a, ['Cochera 12', '3B'])) await ocupar(id)
})

afterEach(limpiar)

describe('misUnidadesPorConsorcio', () => {
  it('agrupa las unidades propias por consorcio', async () => {
    await habilitarEnConsorcio(usuario.id, b, 'consorcista')
    const [propia] = await unidades(b, ['1A', '1B'])
    await ocupar(propia)

    const mapa = await leer()
    expect(mapa.get(a)).toEqual(['3B', 'Cochera 12'])
    expect(mapa.get(b)).toEqual(['1A'])
  })

  it('no incluye un consorcio archivado', async () => {
    await habilitarEnConsorcio(usuario.id, b, 'consorcista')
    const [propia] = await unidades(b, ['1A'])
    await ocupar(propia)
    await prismaBase.consorcio.update({ where: { id: b }, data: { archivadoEn: new Date() } })

    expect([...(await leer()).keys()]).toEqual([a])
  })

  it('no cuenta una ocupacion vencida', async () => {
    await habilitarEnConsorcio(usuario.id, b, 'consorcista')
    const [propia] = await unidades(b, ['1A'])
    await ocupar(propia, '2026-06-01')

    expect((await leer()).has(b)).toBe(false)
  })

  it('no muestra un consorcio sin habilitacion vigente aunque tenga ocupacion', async () => {
    const [propia] = await unidades(b, ['1A'])
    await ocupar(propia)

    expect((await leer()).has(b)).toBe(false)
  })
})
