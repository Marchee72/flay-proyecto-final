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
  finalizar,
  tomarDireccion,
} from '@/aplicacion/asambleas/conducir'
import { AsambleaInvalida, NoPresente } from '@/aplicacion/asambleas/errores'
import { guardarObservacion } from '@/aplicacion/asambleas/observaciones'
import { registrarPoderEnPapel } from '@/aplicacion/asambleas/poderes'
import { verAsamblea } from '@/aplicacion/asambleas/ver'
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

async function armarReunion(opciones: { administracionInvitada?: boolean } = {}) {
  asambleaId = await asambleaConvocada(e, opciones)
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
}

const cerrarTodo = async () => {
  for (const p of puntos) {
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: p.id })
    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: p.id })
  }
}

const observar = (usuarioId: string, texto: string) =>
  guardarObservacion(repo, RELOJ, { ...de(usuarioId), texto })

const filas = () =>
  prismaBase.observacionAsamblea.findMany({ where: { asambleaId }, orderBy: { creadoEn: 'asc' } })

beforeEach(async () => {
  e = await armarEscenario({ conExtra: true })
  await armarReunion()
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

describe('conteo', () => {
  it('una llegada tardía no mueve el conteo de un punto cerrado, sí el del abierto', async () => {
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntos[0].id })
    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntos[0].id })
    const antes = (await verAsamblea(repo, RELOJ, de(e.carla))).puntos[0].conteo!
    await acreditarme(repo, RELOJ, de(e.elsa!))
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: puntos[1].id })
    const vista = await verAsamblea(repo, RELOJ, de(e.carla))
    expect(vista.puntos[0].conteo).toEqual(antes)
    expect(vista.puntos[1].conteo!.basePresentes.unidades).toBe(antes.basePresentes.unidades + 1)
  })
})

describe('observaciones', () => {
  it('con puntos sin cerrar se rechaza', async () => {
    await expect(observar(e.ana, 'Antes de tiempo')).rejects.toThrow(
      /después de tratar todo el orden del día/,
    )
  })

  it('cada presente deja una sola y puede corregirla', async () => {
    await cerrarTodo()
    await observar(e.ana, 'Primera')
    await observar(e.ana, 'Corregida')
    expect(await filas()).toMatchObject([{ usuarioId: e.ana, unidades: '1A', texto: 'Corregida' }])
  })

  it('quien dirige escribe aunque no represente unidades', async () => {
    await cerrarTodo()
    await tomarDireccion(repo, RELOJ, de(e.administracion))
    await observar(e.administracion, 'Agradecer al encargado')
    expect(await filas()).toMatchObject([{ usuarioId: e.administracion, unidades: '' }])
  })

  it('el apoderado acreditado a mano puede escribir', async () => {
    await cerrarTodo()
    await observar(e.ivan, 'Hablo por 2B')
    const vista = await verAsamblea(repo, RELOJ, de(e.ivan))
    expect(vista.yo.puedeObservar).toBe(true)
    expect(await filas()).toMatchObject([{ usuarioId: e.ivan, unidades: '2B' }])
  })

  it('quien no está presente no escribe', async () => {
    await cerrarTodo()
    const vista = await verAsamblea(repo, RELOJ, de(e.elsa!))
    expect(vista.yo.puedeObservar).toBe(false)
    await expect(observar(e.elsa!, 'No vine')).rejects.toBeInstanceOf(NoPresente)
  })

  it('vacía no cuenta ni se muestra', async () => {
    await cerrarTodo()
    await observar(e.ana, 'Algo')
    await observar(e.ana, '   ')
    const vista = await verAsamblea(repo, RELOJ, de(e.consejo))
    expect(vista.observacionesRecibidas).toBe(0)
    await finalizar(repo, RELOJ, de(e.consejo))
    expect((await verAsamblea(repo, RELOJ, de(e.carla))).observaciones).toEqual([])
  })

  it('más de 1.000 caracteres se rechaza; 1.000 pasan', async () => {
    await cerrarTodo()
    await expect(observar(e.ana, 'a'.repeat(1001))).rejects.toBeInstanceOf(AsambleaInvalida)
    await observar(e.ana, 'a'.repeat(1000))
    expect((await filas())[0].texto).toHaveLength(1000)
  })

  it('finalizada ya no cambia', async () => {
    await cerrarTodo()
    await observar(e.ana, 'A tiempo')
    await finalizar(repo, RELOJ, de(e.consejo))
    await expect(observar(e.ana, 'Tarde')).rejects.toThrow(/antes de finalizar/)
    await expect(
      prismaBase.$executeRaw`UPDATE "ObservacionAsamblea" SET texto = 'Tarde' WHERE asamblea_id = ${asambleaId}::uuid`,
    ).rejects.toThrow(/antes de finalizar/)
  })

  it('no se borra suelta, pero cae con la asamblea', async () => {
    await cerrarTodo()
    await observar(e.ana, 'Queda')
    await expect(
      prismaBase.$executeRaw`DELETE FROM "ObservacionAsamblea" WHERE asamblea_id = ${asambleaId}::uuid`,
    ).rejects.toThrow(/no se borra/)
    await prismaBase.asamblea.delete({ where: { id: asambleaId } })
    expect(await filas()).toEqual([])
  })

  it('deja asiento en la bitácora', async () => {
    await cerrarTodo()
    await observar(e.ana, 'Con asiento')
    const [fila] = await filas()
    const asientos = await prismaBase.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM "BitacoraAuditoria"
      WHERE tabla = 'ObservacionAsamblea' AND clave = ${fila.id}`
    expect(Number(asientos[0].total)).toBe(1)
  })

  it('otro consorcio no la alcanza', async () => {
    await cerrarTodo()
    await expect(observar(e.ajeno.administrador, 'De afuera')).rejects.toThrow()
    expect(await filas()).toEqual([])
  })
})

describe('quién lee', () => {
  it('durante la reunión, quien dirige ve el total y nadie la lista', async () => {
    await cerrarTodo()
    await observar(e.ana, 'Texto de Ana')
    await observar(e.bruno, 'Texto de Bruno')

    const dirige = await verAsamblea(repo, RELOJ, de(e.consejo))
    expect(dirige.observacionesAbiertas).toBe(true)
    expect(dirige.observacionesRecibidas).toBe(2)
    expect(dirige.observaciones).toEqual([])

    const bruno = await verAsamblea(repo, RELOJ, de(e.bruno))
    expect(bruno.observacionesRecibidas).toBe(0)
    expect(bruno.yo.miObservacion).toBe('Texto de Bruno')
  })

  it('con acta, leen quienes redactan, presidencia y administración aunque no esté invitada', async () => {
    await armarReunion({ administracionInvitada: false })
    await cerrarTodo()
    await observar(e.ana, 'Texto de Ana')
    await finalizar(repo, RELOJ, de(e.consejo))

    for (const quien of [e.carla, e.consejo, e.ana, e.administracion]) {
      const { observaciones } = await verAsamblea(repo, RELOJ, de(quien))
      expect(observaciones).toMatchObject([{ unidades: '1A', texto: 'Texto de Ana' }])
      expect(observaciones[0].autor).toBeTruthy()
    }
    expect((await verAsamblea(repo, RELOJ, de(e.bruno))).observaciones).toEqual([])
  })

  it('la vista de un asistente común no trae textos ajenos', async () => {
    await cerrarTodo()
    await observar(e.ana, 'Texto de Ana')
    const enReunion = await verAsamblea(repo, RELOJ, de(e.bruno))
    expect(JSON.stringify(enReunion)).not.toContain('Texto de Ana')

    await finalizar(repo, RELOJ, de(e.consejo))
    const conActa = await verAsamblea(repo, RELOJ, de(e.bruno))
    expect(conActa.acta).not.toBeNull()
    expect(JSON.stringify(conActa)).not.toContain('Texto de Ana')
  })
})
