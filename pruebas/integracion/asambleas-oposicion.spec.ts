import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  abrir,
  abrirPunto,
  acreditarme,
  cerrarPunto,
  constituir,
  designarAutoridades,
} from '@/aplicacion/asambleas/conducir'
import { FueraDePlazo, NoEraAusente } from '@/aplicacion/asambleas/errores'
import { oponerme, registrarOposicionEnPapel } from '@/aplicacion/asambleas/oposicion'
import { verAsamblea } from '@/aplicacion/asambleas/ver'
import { votar } from '@/aplicacion/asambleas/votar'
import { relojFijo } from '../dominio/reloj-fijo'
import { prismaBase } from '@/infraestructura/prisma'

import {
  armarEscenario,
  asambleaConvocada,
  enLaReunion,
  repo,
  type Escenario,
} from './asambleas-ayudas'
import { limpiar } from './ayudas'

/**
 * Decisión provisoria y oposición de ausentes (US5, CCyC art. 2060, FR-027 a
 * FR-029). Presentes: Bruno (30) y Carla (20). Ausentes con voto: Ana (40) y
 * Dora (10, sin cuenta). Bruno y Carla votan positivo: sobre los presentes se
 * aprueba, sobre el total (2 de 4 unidades, 50 de 100) no.
 */

let e: Escenario
let asambleaId: string
let puntoId: string
const RELOJ = enLaReunion(40) // segunda convocatoria: sesiona con los presentes
const de = (usuarioId: string) => ({ usuarioId, consorcioId: e.consorcioId, asambleaId })

async function votarYCerrar(regla: 'presentes' | 'totalidad') {
  await prismaBase.consorcio.update({
    where: { id: e.consorcioId },
    data: { reglaMayoriaAsamblea: regla },
  })
  asambleaId = await asambleaConvocada(e)
  puntoId = (await prismaBase.puntoAsamblea.findFirstOrThrow({ where: { asambleaId, orden: 1 } }))
    .id
  await abrir(repo, RELOJ, de(e.consejo))
  await acreditarme(repo, RELOJ, de(e.bruno))
  await acreditarme(repo, RELOJ, de(e.carla))
  await designarAutoridades(repo, RELOJ, {
    ...de(e.consejo),
    presidenteId: e.bruno,
    secretarioId: e.carla,
  })
  await constituir(repo, RELOJ, de(e.consejo))
  await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId })
  for (const [u, unidad] of [
    [e.bruno, '1B'],
    [e.carla, '2A'],
  ] as const) {
    await votar(repo, RELOJ, {
      ...de(u),
      puntoId,
      unidadId: e.unidades[unidad],
      eleccion: { sentido: 'positivo' },
    })
  }
  await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId })
}

beforeEach(async () => {
  e = await armarEscenario()
})

afterEach(async () => {
  await limpiar()
})

describe('regla «totalidad»', () => {
  it('queda provisoria con plazo de 15 días y avisa a los ausentes por los dos canales', async () => {
    await votarYCerrar('totalidad')
    const punto = await prismaBase.puntoAsamblea.findUniqueOrThrow({ where: { id: puntoId } })
    expect(punto).toMatchObject({ resultado: 'aprobado', provisorio: true })
    expect(punto.vencePlazoOposicion!.getTime() - punto.cerradoEn!.getTime()).toBe(15 * 86_400_000)

    const avisos = await prismaBase.notificacion.findMany({
      where: { tipo: 'decision_provisoria', entidadId: asambleaId },
    })
    expect(avisos.map((a) => a.usuarioId)).toEqual([e.ana])
    const correos = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'correo_directo' },
    })
    // Uno de la convocatoria y uno de la decisión provisoria, los dos a Dora.
    expect(
      correos.filter((c) => (c.carga as { titulo: string }).titulo.startsWith('Decisión')),
    ).toHaveLength(1)

    expect((await verAsamblea(repo, RELOJ, de(e.ana))).puntos[0].estadoDecision).toBe('provisoria')
  })

  it('solo se opone el propietario de una unidad ausente, dentro del plazo', async () => {
    await votarYCerrar('totalidad')
    await expect(
      oponerme(repo, RELOJ, { ...de(e.bruno), puntoId, unidadId: e.unidades['1B'] }),
    ).rejects.toBeInstanceOf(NoEraAusente)
    const tarde = relojFijo('2026-12-20T12:00:00Z')
    await expect(
      oponerme(repo, tarde, { ...de(e.ana), puntoId, unidadId: e.unidades['1A'] }),
    ).rejects.toBeInstanceOf(FueraDePlazo)
    await oponerme(repo, RELOJ, { ...de(e.ana), puntoId, unidadId: e.unidades['1A'] })
    expect(await prismaBase.oposicionDecision.count({ where: { puntoId } })).toBe(1)
  })

  it('con oposiciones suficientes cae; sin oposiciones queda firme al vencer', async () => {
    await votarYCerrar('totalidad')
    const despues = relojFijo('2026-12-15T12:00:00Z')
    expect((await verAsamblea(repo, despues, de(e.ana))).puntos[0].estadoDecision).toBe('firme')

    await oponerme(repo, RELOJ, { ...de(e.ana), puntoId, unidadId: e.unidades['1A'] })
    await registrarOposicionEnPapel(repo, RELOJ, {
      ...de(e.administracion),
      puntoId,
      unidadId: e.unidades['2B'],
      personaId: e.personaDora,
    })
    expect((await verAsamblea(repo, despues, de(e.ana))).puntos[0].estadoDecision).toBe('caida')
  })
})

describe('regla «presentes»', () => {
  it('nunca queda provisoria', async () => {
    await votarYCerrar('presentes')
    const punto = await prismaBase.puntoAsamblea.findUniqueOrThrow({ where: { id: puntoId } })
    expect(punto).toMatchObject({ resultado: 'aprobado', provisorio: false })
    await expect(
      oponerme(repo, RELOJ, { ...de(e.ana), puntoId, unidadId: e.unidades['1A'] }),
    ).rejects.toBeInstanceOf(FueraDePlazo)
  })
})
