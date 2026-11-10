import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  abrir,
  acreditarme,
  constituir,
  designarAutoridades,
  abrirPunto,
} from '@/aplicacion/asambleas/conducir'
import {
  ApoderadoNoHabilitado,
  AsambleaYaAbierta,
  NoEsPropietario,
  NoRepresenta,
  UnidadYaTienePoder,
} from '@/aplicacion/asambleas/errores'
import { otorgarPoder, registrarPoderEnPapel, revocarPoder } from '@/aplicacion/asambleas/poderes'
import { verAsamblea } from '@/aplicacion/asambleas/ver'
import { votar } from '@/aplicacion/asambleas/votar'
import { TopeDePoderes } from '@/dominio/asambleas/poderes'
import { prismaBase } from '@/infraestructura/prisma'

import {
  armarEscenario,
  asambleaConvocada,
  enLaReunion,
  HOY,
  repo,
  type Escenario,
} from './asambleas-ayudas'
import { crearUsuario, habilitarEnConsorcio, limpiar } from './ayudas'

/** Poderes (US3, FR-010 a FR-014, art. 23 del reglamento). */

let e: Escenario
let asambleaId: string
const RELOJ = enLaReunion(5)
const de = (usuarioId: string) => ({ usuarioId, consorcioId: e.consorcioId, asambleaId })

beforeEach(async () => {
  e = await armarEscenario()
  asambleaId = await asambleaConvocada(e)
})

afterEach(async () => {
  await limpiar()
})

describe('otorgar', () => {
  it('el propietario le da poder a su inquilino, que se acredita y vota; avisa a los dos', async () => {
    await otorgarPoder(repo, HOY, { ...de(e.ana), unidadId: e.unidades['1A'], apoderadoId: e.ivan })
    expect(
      await prismaBase.notificacion.count({
        where: { tipo: 'poder_otorgado', entidadId: asambleaId },
      }),
    ).toBe(2)

    await abrir(repo, RELOJ, de(e.consejo))
    await acreditarme(repo, RELOJ, de(e.ivan))
    await acreditarme(repo, RELOJ, de(e.bruno))
    await designarAutoridades(repo, RELOJ, {
      ...de(e.consejo),
      presidenteId: e.ivan,
      secretarioId: e.bruno,
    })
    await constituir(repo, RELOJ, de(e.consejo))
    const punto = await prismaBase.puntoAsamblea.findFirstOrThrow({
      where: { asambleaId, orden: 1 },
    })
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: punto.id })
    await votar(repo, RELOJ, {
      ...de(e.ivan),
      puntoId: punto.id,
      unidadId: e.unidades['1A'],
      eleccion: { sentido: 'positivo' },
    })
    const fila = await prismaBase.unidadEnAsamblea.findFirstOrThrow({
      where: { asambleaId, unidadId: e.unidades['1A'] },
    })
    expect(fila).toMatchObject({ representanteId: e.ivan, representacion: 'apoderado' })
  })

  it('solo el propietario vigente otorga, y solo a un usuario habilitado', async () => {
    await expect(
      otorgarPoder(repo, HOY, { ...de(e.bruno), unidadId: e.unidades['1A'], apoderadoId: e.ivan }),
    ).rejects.toBeInstanceOf(NoEsPropietario)
    const sinHabilitar = (await crearUsuario('Zoe', 'Ajena')).id
    await expect(
      otorgarPoder(repo, HOY, {
        ...de(e.ana),
        unidadId: e.unidades['1A'],
        apoderadoId: sinHabilitar,
      }),
    ).rejects.toBeInstanceOf(ApoderadoNoHabilitado)
  })

  it('un segundo poder vigente sobre la misma unidad falla', async () => {
    await otorgarPoder(repo, HOY, { ...de(e.ana), unidadId: e.unidades['1A'], apoderadoId: e.ivan })
    await expect(
      otorgarPoder(repo, HOY, { ...de(e.ana), unidadId: e.unidades['1A'], apoderadoId: e.bruno }),
    ).rejects.toBeInstanceOf(UnidadYaTienePoder)
  })

  it('el tope por apoderado se respeta, también con otorgamientos simultáneos', async () => {
    // La asamblea ya convocada conserva su tope (3): se prueba con otra, convocada con tope 1.
    await prismaBase.consorcio.update({
      where: { id: e.consorcioId },
      data: { topeUnidadesPorApoderado: 1 },
    })
    const otra = await asambleaConvocada(e)
    const resultados = await Promise.allSettled([
      otorgarPoder(repo, HOY, {
        ...de(e.ana),
        asambleaId: otra,
        unidadId: e.unidades['1A'],
        apoderadoId: e.ivan,
      }),
      otorgarPoder(repo, HOY, {
        ...de(e.bruno),
        asambleaId: otra,
        unidadId: e.unidades['1B'],
        apoderadoId: e.ivan,
      }),
    ])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rechazo.reason).toBeInstanceOf(TopeDePoderes)
  })

  it('el poder en papel se registra por la administración', async () => {
    await registrarPoderEnPapel(repo, HOY, {
      ...de(e.administracion),
      unidadId: e.unidades['2B'],
      otorganteId: e.personaDora,
      apoderadoId: e.carla,
    })
    const poder = await prismaBase.poder.findFirstOrThrow({
      where: { asambleaId, unidadId: e.unidades['2B'] },
    })
    expect(poder.origen).toBe('papel')
  })
})

describe('revocar y validez', () => {
  it('se revoca antes de abrir y avisa; abierta, ya no', async () => {
    await otorgarPoder(repo, HOY, { ...de(e.ana), unidadId: e.unidades['1A'], apoderadoId: e.ivan })
    const poder = await prismaBase.poder.findFirstOrThrow({ where: { asambleaId } })
    await revocarPoder(repo, HOY, { ...de(e.ana), poderId: poder.id })
    expect(
      await prismaBase.notificacion.count({
        where: { tipo: 'poder_revocado', entidadId: asambleaId },
      }),
    ).toBe(2)

    await otorgarPoder(repo, HOY, { ...de(e.ana), unidadId: e.unidades['1A'], apoderadoId: e.ivan })
    const otro = await prismaBase.poder.findFirstOrThrow({
      where: { asambleaId, revocadoEn: null },
    })
    await abrir(repo, RELOJ, de(e.consejo))
    await expect(
      revocarPoder(repo, RELOJ, { ...de(e.ana), poderId: otro.id }),
    ).rejects.toBeInstanceOf(AsambleaYaAbierta)
  })

  it('un poder de quien dejó de ser propietario no vale', async () => {
    await otorgarPoder(repo, HOY, { ...de(e.ana), unidadId: e.unidades['1A'], apoderadoId: e.ivan })
    // Ana vende antes de la reunión: su ocupación termina el 20 de noviembre.
    await prismaBase.$executeRaw`
      UPDATE "Ocupacion" o SET vigencia = daterange(lower(o.vigencia), '2026-11-20', '[)')
      FROM "Usuario" u
      WHERE u.persona_id = o.persona_id AND u.id = ${e.ana}::uuid AND o.unidad_id = ${e.unidades['1A']}::uuid`
    await abrir(repo, RELOJ, de(e.consejo))
    await expect(acreditarme(repo, RELOJ, de(e.ivan))).rejects.toBeInstanceOf(NoRepresenta)
    const vista = await verAsamblea(repo, RELOJ, de(e.consejo))
    expect(vista.poderes[0].sinEfecto).toBe(true)
  })

  it('un inquilino sin poder ve la asamblea pero no vota', async () => {
    const vista = await verAsamblea(repo, HOY, de(e.ivan))
    expect(vista.yo.misUnidades).toEqual([])
  })

  it('cualquier vecino habilitado puede ser apoderado', async () => {
    const vecina = (await crearUsuario('Vera', 'Vecina')).id
    await habilitarEnConsorcio(vecina, e.consorcioId, 'consorcista')
    await otorgarPoder(repo, HOY, {
      ...de(e.bruno),
      unidadId: e.unidades['1B'],
      apoderadoId: vecina,
    })
    const vista = await verAsamblea(repo, HOY, de(vecina))
    expect(vista.yo.misUnidades.map((m) => m.designacion)).toEqual(['1B'])
  })
})
