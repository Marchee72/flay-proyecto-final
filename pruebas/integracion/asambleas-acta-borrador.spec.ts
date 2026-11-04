import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  designarFirmantes,
  enviarAFirmar,
  guardarNotas,
  manejadorBorradorActa,
  pedirBorrador,
  redactarResumen,
} from '@/aplicacion/asambleas/acta'
import {
  abrir,
  abrirPunto,
  acreditarme,
  cerrarPunto,
  constituir,
  designarAutoridades,
  finalizar,
} from '@/aplicacion/asambleas/conducir'
import { ActaIncompleta, NoDirige } from '@/aplicacion/asambleas/errores'
import { registrarPoderEnPapel } from '@/aplicacion/asambleas/poderes'
import { verAsamblea } from '@/aplicacion/asambleas/ver'
import type { PuntoParaRedactar, RedactorActa } from '@/dominio/contratos/asistencia'
import { noDisponible, disponible } from '@/dominio/contratos/asistencia'
import { asistenciaDeterminista } from '@/infraestructura/asistencia/determinista'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
import { prismaBase } from '@/infraestructura/prisma'

import { relojFijo } from '../dominio/reloj-fijo'
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
 * El borrador del acta (RF-32, RN-14): la IA propone con los resultados y las
 * notas de la reunión, y nada cuenta hasta que una persona lo guarda. Preside
 * Iván y es secretaria Carla; dirige el consejo.
 */

const RELOJ = enLaReunion(5)
const DESPUES = relojFijo('2026-11-27T12:00:00Z')
const generador = { acta: async () => new Uint8Array([1]) }
const almacen = {
  guardar: async () => {},
  resolverLecturaAutorizada: async () => 'data:application/pdf;base64,AQ==',
}

let e: Escenario
let asambleaId: string
let actaId: string
let puntos: { id: string; orden: number }[]
const de = (usuarioId: string) => ({ usuarioId, consorcioId: e.consorcioId, asambleaId })

const trabajos = () =>
  prismaBase.trabajoPendiente.findMany({
    where: { tipo: 'redactar_acta', carga: { path: ['actaId'], equals: actaId } },
  })

const leerPuntos = () =>
  prismaBase.puntoAsamblea.findMany({ where: { asambleaId }, orderBy: { orden: 'asc' } })

const leerActa = () => prismaBase.actaAsamblea.findUniqueOrThrow({ where: { id: actaId } })

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
  for (const u of [e.ana, e.bruno, e.carla, e.ivan, e.elsa!]) await acreditarme(repo, RELOJ, de(u))
  await designarAutoridades(repo, RELOJ, {
    ...de(e.consejo),
    presidenteId: e.ivan,
    secretarioId: e.carla,
  })
  await constituir(repo, RELOJ, de(e.consejo))
  puntos = await leerPuntos()
  for (const p of puntos) {
    await abrirPunto(repo, RELOJ, { ...de(e.consejo), puntoId: p.id })
    if (p.id === puntos[0].id) {
      await guardarNotas(repo, RELOJ, {
        ...de(e.carla),
        puntoId: p.id,
        notas: 'Tres presupuestos de pintura',
      })
    }
    await cerrarPunto(repo, RELOJ, { ...de(e.consejo), puntoId: p.id })
  }
  await finalizar(repo, RELOJ, de(e.consejo))
  actaId = (await prismaBase.actaAsamblea.findFirstOrThrow({ where: { asambleaId } })).id
})

afterEach(async () => {
  await limpiar()
})

describe('notas de la reunión', () => {
  it('solo las toman la secretaria y quien dirige', async () => {
    await expect(
      guardarNotas(repo, RELOJ, { ...de(e.ana), puntoId: puntos[0].id, notas: 'x' }),
    ).rejects.toBeInstanceOf(NoDirige)
  })

  it('terminada la reunión, ya no cambian', async () => {
    await expect(
      guardarNotas(repo, DESPUES, { ...de(e.carla), puntoId: puntos[0].id, notas: 'otra' }),
    ).rejects.toThrow(/mientras el punto está abierto/)
    await expect(
      prismaBase.$executeRaw`UPDATE "PuntoAsamblea" SET notas = 'otra' WHERE id = ${puntos[0].id}::uuid`,
    ).rejects.toThrow(/mientras el punto está abierto/)
  })

  it('notas y borrador no viajan a quien no redacta', async () => {
    await manejadorBorradorActa(asistenciaDeterminista.redactor)({ actaId })
    const ajena = await verAsamblea(repo, DESPUES, de(e.ana))
    const propia = await verAsamblea(repo, DESPUES, de(e.carla))
    expect(ajena.puntos[0].notas).toBeNull()
    expect(ajena.puntos[0].borradorResumen).toBeNull()
    expect(propia.puntos[0].notas).toBe('Tres presupuestos de pintura')
    expect(propia.puntos[0].borradorResumen).toBeTruthy()
  })
})

describe('el borrador', () => {
  it('finalizar lo pide una sola vez y lo marca en curso', async () => {
    expect(await trabajos()).toHaveLength(1)
    expect((await leerActa()).borradorPedidoEn).not.toBeNull()
    const vista = await verAsamblea(repo, RELOJ, de(e.carla))
    expect(vista.acta?.borradorPendiente).toBe(true)
  })

  it('un borrador trabado deja de bloquear la edición a los dos minutos', async () => {
    const vista = await verAsamblea(repo, relojFijo('2026-11-25T23:00:00Z'), de(e.carla))
    expect(vista.acta?.borradorPendiente).toBe(false)
  })

  it('escribe la propuesta aparte: no toca el resumen ya guardado', async () => {
    await redactarResumen(repo, DESPUES, {
      ...de(e.carla),
      puntoId: puntos[1].id,
      resumen: 'Escrito por la secretaria.',
    })
    await manejadorBorradorActa(asistenciaDeterminista.redactor)({ actaId })

    const [uno, dos] = await leerPuntos()
    expect(uno.resumen).toBeNull()
    expect(uno.borradorResumen).toContain('Tres presupuestos de pintura')
    expect(dos.resumen).toBe('Escrito por la secretaria.')
    expect((await leerActa()).borradorPedidoEn).toBeNull()
  })

  it('al redactor no le llegan personas, unidades ni votos', async () => {
    let recibidos: PuntoParaRedactar[] = []
    const espia: RedactorActa = {
      async redactar(_, p) {
        recibidos = p
        return disponible([])
      },
    }
    await manejadorBorradorActa(espia)({ actaId })

    expect(recibidos).toHaveLength(puntos.length)
    expect(recibidos[0].notas).toBe('Tres presupuestos de pintura')
    expect(Object.keys(recibidos[0]).sort()).toEqual(
      ['conteo', 'descripcion', 'notas', 'orden', 'provisorio', 'resultado', 'titulo'].sort(),
    )
    const texto = JSON.stringify(recibidos)
    for (const dato of ['Ana', 'Bruno', 'Carla', e.ana, ...Object.keys(e.unidades)]) {
      expect(texto).not.toContain(dato)
    }
  })

  it('sin servicio queda sin borrador y sin pendiente, y se puede pedir de nuevo', async () => {
    await manejadorBorradorActa(asistenciaNula.redactor)({ actaId })
    expect((await leerPuntos()).every((p) => p.borradorResumen === null)).toBe(true)
    expect((await leerActa()).borradorPedidoEn).toBeNull()

    await pedirBorrador(repo, DESPUES, de(e.carla))
    expect((await leerActa()).borradorPedidoEn).not.toBeNull()
    expect(await trabajos()).toHaveLength(2)
    await expect(pedirBorrador(repo, DESPUES, de(e.ana))).rejects.toBeInstanceOf(NoDirige)
  })

  it('una respuesta que no se entiende no deja el acta trabada', async () => {
    const falla: RedactorActa = { redactar: async () => noDisponible('no se entiende') }
    await manejadorBorradorActa(falla)({ actaId })
    expect((await leerActa()).borradorPedidoEn).toBeNull()
  })

  it('no se envía a firmar con texto que nadie guardó (RN-14)', async () => {
    await manejadorBorradorActa(asistenciaDeterminista.redactor)({ actaId })
    await designarFirmantes(repo, DESPUES, { ...de(e.consejo), propietarios: [e.ana, e.bruno] })
    await expect(
      enviarAFirmar(repo, DESPUES, { generador, almacen }, de(e.consejo)),
    ).rejects.toBeInstanceOf(ActaIncompleta)
  })

  it('enviada a firmar, ni el borrador ni el pedido cambian', async () => {
    for (const p of puntos) {
      await redactarResumen(repo, DESPUES, { ...de(e.carla), puntoId: p.id, resumen: 'Texto.' })
    }
    await designarFirmantes(repo, DESPUES, { ...de(e.consejo), propietarios: [e.ana, e.bruno] })
    await enviarAFirmar(repo, DESPUES, { generador, almacen }, de(e.consejo))

    await manejadorBorradorActa(asistenciaDeterminista.redactor)({ actaId })
    expect((await leerPuntos()).every((p) => p.borradorResumen === null)).toBe(true)
    await expect(
      prismaBase.$executeRaw`UPDATE "PuntoAsamblea" SET borrador_resumen = 'x' WHERE id = ${puntos[0].id}::uuid`,
    ).rejects.toThrow(/ya no cambia/)
  })
})
