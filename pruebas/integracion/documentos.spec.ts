import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import type { GeneradorDeDocumentos } from '@/dominio/contratos/documentos'
import { NoEncontrado } from '@/compartido/errores'
import { generarDocumentos, manejadorDocumentoExpensa } from '@/aplicacion/liquidacion/documentos'
import { liquidarPeriodo } from '@/aplicacion/liquidacion/liquidar'
import { cerrarPeriodo } from '@/aplicacion/liquidacion/periodos'
import { verExpensa } from '@/aplicacion/liquidacion/ver-expensa'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { JUEGO } from '../fixtures/juego-13-4'
import { relojFijo } from '../dominio/reloj-fijo'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * El documento de expensa, diferido y autorizado (`FR-016`, `FR-018`, `FR-019`,
 * SC-007, SC-008).
 *
 * El generador y el almacen son dobles: lo que se prueba es la cola, el
 * progreso, el aislamiento de una falla y quien puede ver que. Rendear PDF de
 * verdad es de infraestructura y no cambia ninguna de esas cuatro cosas.
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let guardados: string[]

const almacenDoble: AlmacenObjetos = {
  async emitirPermisoDeSubida(clave) {
    return { clave, credencial: 'x', vence: new Date() }
  },
  async guardar(clave) {
    guardados.push(clave)
  },
  async resolverLecturaAutorizada(clave) {
    return `https://almacen.test/${clave}`
  },
  async eliminar() {},
}

const generadorDoble = (falla?: string): GeneradorDeDocumentos => ({
  async expensa(datos) {
    if (datos.unidad.designacion === falla) throw new Error(`no se pudo rendear ${falla}`)
    return new Uint8Array([37, 80, 68, 70]) // %PDF
  },
})

beforeEach(async () => {
  guardados = []
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
})

afterEach(async () => {
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "InteresLiquidado"`
  await prismaBase.$executeRaw`DELETE FROM "DetalleLiquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "Liquidacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

async function emitirSobre(unidades: readonly { designacion: string; coeficiente: string }[]) {
  await cargarPadron(repo, RELOJ, { usuarioId: administrador, consorcioId, unidades })

  const { periodoId } = await abrirPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes: 8,
  })
  await cerrarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })

  return liquidarPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, periodoId })
}

describe('generacion diferida (SC-007)', () => {
  it('sobre 96 unidades aparecen 96 documentos, ni uno menos', async () => {
    const emitida = await emitirSobre(JUEGO.consorcios[1].unidades)

    const encolados = await prismaBase.trabajoPendiente.count({
      where: { tipo: 'documento_expensa', estado: 'pendiente' },
    })
    expect(encolados).toBe(96)

    // Cada disparo esta acotado por tiempo y el administrador puede apretar de
    // nuevo (research R-02): contra la base remota, un disparo no alcanza para
    // los 96, y eso es lo esperado. Lo que se prueba es que converge.
    const manejador = manejadorDocumentoExpensa(generadorDoble(), almacenDoble)
    let progreso = { generados: 0, total: 96 }

    for (let disparo = 0; disparo < 6 && progreso.generados < progreso.total; disparo++) {
      progreso = await generarDocumentos(manejador, repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        liquidacionId: emitida.liquidacionId,
      })
    }

    expect(progreso).toEqual({ generados: 96, total: 96 })
    expect(guardados).toHaveLength(96)
    expect(guardados[0]).toMatch(new RegExp(`^expensas/${consorcioId}/${emitida.liquidacionId}/`))
    // Noventa y seis documentos son unos trescientos viajes a la base remota:
    // esta prueba tarda mas que el tope general y SC-007 concede diez minutos.
  }, 180_000)

  it('una falla en un documento deja los otros intactos y la liquidacion valida (FR-019)', async () => {
    const emitida = await emitirSobre(JUEGO.consorcios[0].unidades)

    const progreso = await generarDocumentos(
      manejadorDocumentoExpensa(generadorDoble('2B'), almacenDoble),
      repo,
      RELOJ,
      { usuarioId: administrador, consorcioId, liquidacionId: emitida.liquidacionId },
    )

    expect(progreso).toEqual({ generados: 11, total: 12 })

    // El trabajo que fallo queda pendiente con su error, para reintentar; la
    // liquidacion sigue vigente como si nada.
    const pendiente = await prismaBase.trabajoPendiente.findFirstOrThrow({
      where: { tipo: 'documento_expensa', estado: 'pendiente' },
    })
    expect(pendiente.ultimoError).toContain('2B')

    const liquidacion = await prismaBase.liquidacion.findUniqueOrThrow({
      where: { id: emitida.liquidacionId },
    })
    expect(liquidacion.estado).toBe('vigente')
  })
})

describe('quien ve que (FR-018, SC-008)', () => {
  it('el consorcista ve la de su unidad y otra responde «no encontrado»', async () => {
    const emitida = await emitirSobre(JUEGO.consorcios[0].unidades)

    await generarDocumentos(
      manejadorDocumentoExpensa(generadorDoble(), almacenDoble),
      repo,
      RELOJ,
      { usuarioId: administrador, consorcioId, liquidacionId: emitida.liquidacionId },
    )

    const detalles = await prismaBase.detalleLiquidacion.findMany({
      where: { liquidacionId: emitida.liquidacionId },
      include: { unidad: true },
      orderBy: { unidad: { designacion: 'asc' } },
    })
    const suya = detalles.find((d) => d.unidad.designacion === '1A')!
    const ajena = detalles.find((d) => d.unidad.designacion === '1B')!

    const vecina = await crearUsuario('Nadia')
    await registrarOcupacion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidadId: suya.unidadId,
      personaId: vecina.personaId,
      tipo: 'propietario',
      desde: new Date('2026-01-01'),
    })

    const propia = await verExpensa(almacenDoble, repo, RELOJ, {
      usuarioId: vecina.id,
      consorcioId,
      detalleId: suya.id,
    })
    expect(propia.designacion).toBe('1A')
    expect(propia.direccion).toContain('almacen.test/expensas/')

    await expect(
      verExpensa(almacenDoble, repo, RELOJ, {
        usuarioId: vecina.id,
        consorcioId,
        detalleId: ajena.id,
      }),
    ).rejects.toThrow(NoEncontrado)
  })
})
