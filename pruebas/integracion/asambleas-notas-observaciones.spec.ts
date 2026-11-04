import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { guardarNotas } from '@/aplicacion/asambleas/acta'
import {
  abrir,
  abrirPunto,
  acreditar,
  acreditarme,
  cerrarPunto,
  constituir,
  designarAutoridades,
} from '@/aplicacion/asambleas/conducir'
import { registrarPoderEnPapel } from '@/aplicacion/asambleas/poderes'
import { prismaBase } from '@/infraestructura/prisma'

import {
  armarEscenario,
  asambleaConvocada,
  enLaReunion,
  HOY,
  repo,
  type Escenario,
} from './asambleas-ayudas'
import { limpiar } from './ayudas'

/**
 * Lo que cierra la reunión (RF-31, RF-32). Preside Ana, es secretaria Carla y
 * dirige el consejo. Iván es apoderado de 2B y lo acreditó quien dirige, así
 * que su fila del padrón no tiene usuario. Elsa no vino.
 */

const RELOJ = enLaReunion(5)

let e: Escenario
let asambleaId: string
let puntos: { id: string; orden: number }[]
const de = (usuarioId: string) => ({ usuarioId, consorcioId: e.consorcioId, asambleaId })

const leerPuntos = () =>
  prismaBase.puntoAsamblea.findMany({ where: { asambleaId }, orderBy: { orden: 'asc' } })

beforeEach(async () => {
  e = await armarEscenario({ conExtra: true })
  asambleaId = await asambleaConvocada(e)
  await registrarPoderEnPapel(repo, HOY, {
    ...de(e.consejo),
    unidadId: e.unidades['2B'],
    otorganteId: e.personaDora,
    apoderadoId: e.ivan,
  })
  await abrir(repo, RELOJ, de(e.consejo))
  for (const u of [e.ana, e.bruno, e.carla]) await acreditarme(repo, RELOJ, de(u))
  await acreditar(repo, RELOJ, {
    ...de(e.consejo),
    unidadId: e.unidades['2B'],
    nombre: 'Iván',
    representacion: 'apoderado',
  })
  await designarAutoridades(repo, RELOJ, {
    ...de(e.consejo),
    presidenteId: e.ana,
    secretarioId: e.carla,
  })
  await constituir(repo, RELOJ, de(e.consejo))
  puntos = await leerPuntos()
})

afterEach(async () => {
  await limpiar()
})

describe('notas por punto', () => {
  it('con el punto pendiente no se escriben', async () => {
    await expect(
      guardarNotas(repo, RELOJ, { ...de(e.carla), puntoId: puntos[0].id, notas: 'x' }),
    ).rejects.toThrow(/mientras el punto está abierto/)
  })

  it('con el punto abierto se escriben, y al cerrarlo quedan fijas', async () => {
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntos[0].id })
    await guardarNotas(repo, RELOJ, { ...de(e.carla), puntoId: puntos[0].id, notas: 'Debate' })
    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntos[0].id })
    await expect(
      guardarNotas(repo, RELOJ, { ...de(e.carla), puntoId: puntos[0].id, notas: 'Otra' }),
    ).rejects.toThrow(/mientras el punto está abierto/)
    expect((await leerPuntos())[0].notas).toBe('Debate')
  })
})
