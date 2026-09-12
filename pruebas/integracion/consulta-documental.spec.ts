import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type {
  FragmentoParaResponder,
  GeneradorRespuesta,
  GeneradorVectores,
} from '@/dominio/contratos/asistencia'
import { consultarDocumentacion } from '@/aplicacion/comunicacion/consultar'
import { cargarDocumento } from '@/aplicacion/comunicacion/documentos'
import { manejadorIndexacion } from '@/aplicacion/comunicacion/indexar'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { asistenciaDeterminista } from '@/infraestructura/asistencia/determinista'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
import { textoPorPagina } from '@/infraestructura/documentos/texto-pdf'
import { prismaBase } from '@/infraestructura/prisma'
import { repositorioHabilitaciones } from '@/infraestructura/repositorios/habilitaciones'

import { relojFijo } from '../dominio/reloj-fijo'
import { almacenEnMemoria } from './asistencia-ayudas'
import {
  crearAdministradora,
  crearConsorcio,
  crearUsuario,
  habilitarEnConsorcio,
  limpiar,
} from './ayudas'

/**
 * Consulta documental (`RF-20`, `CU-10`, Principio IV) con la determinista y el
 * reglamento ficticio indexado: cita documento y fragmento (SC-014); diez
 * preguntas sin respuesta dan «sin respaldo» (SC-015); un fragmento no
 * visible o de otro consorcio **nunca llega** al generador (SC-016); con la
 * nula, degrada a la lista de documentos (SC-013).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones
const REGLAMENTO = new Uint8Array(
  readFileSync('datos-cliente/reglamento/reglamento-copropiedad.md'),
)

let consorcioId: string
let otroConsorcioId: string
let administrador: string
let vecino: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  vecino = (await crearUsuario('Beto')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(administrador, otroConsorcioId, 'administrador')
  await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
  await habilitarEnConsorcio(vecino, otroConsorcioId, 'consorcista')
})

afterEach(async () => {
  await prismaBase.trabajoPendiente.deleteMany({})
  await limpiar()
})

/** Carga e indexa un documento con la determinista. */
async function indexar(
  enConsorcio: string,
  titulo: string,
  visibleConsorcistas: boolean,
  bytes = REGLAMENTO,
) {
  const clave = `documentos/${enConsorcio}/${crypto.randomUUID()}/${titulo}.md`
  const { almacen, bajar } = almacenEnMemoria({ [clave]: bytes })
  const { documentoId } = await cargarDocumento(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: enConsorcio,
    clave,
    tipoContenido: 'text/markdown',
    tipo: 'reglamento_copropiedad',
    titulo,
    visibleConsorcistas,
  })
  await drenar({
    indexar_documento: manejadorIndexacion(
      almacen,
      asistenciaDeterminista.vectores,
      textoPorPagina,
      bajar,
    ),
  })
  const documento = await prismaBase.documentoConsorcio.findUniqueOrThrow({
    where: { id: documentoId },
  })
  expect(documento.estadoIndexacion).toBe('indexado')
  expect(documento.hashSha256).toHaveLength(64)
  return documentoId
}

const preguntar = (
  usuarioId: string,
  enConsorcio: string,
  pregunta: string,
  asistencia: {
    vectores: GeneradorVectores
    respuestas: GeneradorRespuesta
  } = asistenciaDeterminista,
) =>
  consultarDocumentacion(asistencia, repo, RELOJ, { usuarioId, consorcioId: enConsorcio, pregunta })

describe('consulta documental', () => {
  it('indexa por articulos y responde con cita de documento y fragmento (SC-014)', async () => {
    const documentoId = await indexar(consorcioId, 'Reglamento', true)
    const fragmentos = await prismaBase.fragmentoDocumento.count({ where: { documentoId } })
    expect(fragmentos).toBe(72)

    const r = await preguntar(
      vecino,
      consorcioId,
      '¿Cuántas personas entran en el salón de usos múltiples?',
    )
    expect(r.modo).toBe('respuesta')
    if (r.modo === 'respuesta') {
      expect(r.citas.length).toBeGreaterThan(0)
      expect(r.citas[0].documento).toBe('Reglamento')
      expect(r.respuesta).toContain('cuarenta personas')
    }
    const guardada = await prismaBase.consultaDocumental.findFirstOrThrow({
      where: { consorcioId },
    })
    expect(guardada.sinRespaldo).toBe(false)
    expect(Array.isArray(guardada.fragmentosCitados)).toBe(true)
  })

  it('diez preguntas sin respuesta en el reglamento dan sin respaldo, cero invenciones (SC-015)', async () => {
    await indexar(consorcioId, 'Reglamento', true)
    const sinRespuesta = [
      '¿Qué día pasa el camión de la basura?',
      '¿Cuál es el teléfono del encargado?',
      '¿Hay pileta en la terraza?',
      '¿Cuánto cuesta el estacionamiento para visitas?',
      '¿Se puede pintar el frente de rojo?',
      '¿Quién ganó el mundial?',
      '¿A qué hora abre la farmacia de la esquina?',
      '¿Tiene wifi el salón?',
      '¿Cuánto sale un cambio de cerradura?',
      '¿Puedo poner un parlante en la vereda?',
    ]
    let sinRespaldo = 0
    for (const pregunta of sinRespuesta) {
      const r = await preguntar(vecino, consorcioId, pregunta)
      if (r.modo === 'sin_respaldo') sinRespaldo++
      else if (r.modo === 'respuesta') throw new Error(`inventó para «${pregunta}»: ${r.respuesta}`)
    }
    expect(sinRespaldo).toBe(10)
    const guardadas = await prismaBase.consultaDocumental.findMany({
      where: { consorcioId, sinRespaldo: true },
    })
    expect(guardadas).toHaveLength(10)
    expect(guardadas.every((c) => c.respuesta === null)).toBe(true)
  })

  it('el fragmento no visible o de otro consorcio nunca llega al generador (SC-016, FR-029)', async () => {
    // Un contrato no visible en este consorcio, y el reglamento en el otro.
    await indexar(consorcioId, 'Contrato reservado', false)
    await indexar(otroConsorcioId, 'Reglamento del otro', true)

    const vistos: FragmentoParaResponder[][] = []
    const espia = {
      vectores: asistenciaDeterminista.vectores,
      respuestas: {
        async responder(pregunta: string, fragmentos: FragmentoParaResponder[]) {
          vistos.push(fragmentos)
          return asistenciaDeterminista.respuestas.responder(pregunta, fragmentos)
        },
      },
    }
    const r = await preguntar(
      vecino,
      consorcioId,
      '¿Cuántas personas entran en el salón de usos múltiples?',
      espia,
    )
    expect(r.modo).toBe('sin_respaldo')
    // Ningun fragmento paso: la base no devolvio nada para este rol y consorcio.
    expect(vistos.flat()).toEqual([])

    // El administrador si ve el contrato reservado del propio consorcio.
    const delAdministrador = await preguntar(
      administrador,
      consorcioId,
      '¿Cuántas personas entran en el salón de usos múltiples?',
      espia,
    )
    expect(delAdministrador.modo).toBe('respuesta')
    expect(vistos.flat().every((f) => f.documento === 'Contrato reservado')).toBe(true)
  })

  it('con la nula degrada a la lista de documentos para abrir (SC-013)', async () => {
    await indexar(consorcioId, 'Reglamento', true)
    const r = await preguntar(
      vecino,
      consorcioId,
      '¿Cuántas personas entran en el SUM?',
      asistenciaNula,
    )
    expect(r.modo).toBe('degradado')
    if (r.modo === 'degradado') {
      expect(r.documentos.map((d) => d.titulo)).toEqual(['Reglamento'])
      expect(r.motivo).toMatch(/no está configurado/)
    }
    expect(await prismaBase.consultaDocumental.count({ where: { consorcioId } })).toBe(0)
  })

  it('sin generador de vectores el documento queda en error con motivo, y el trabajo reintenta', async () => {
    const clave = `documentos/${consorcioId}/${crypto.randomUUID()}/r.md`
    const { almacen, bajar } = almacenEnMemoria({ [clave]: REGLAMENTO })
    const { documentoId } = await cargarDocumento(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      clave,
      tipoContenido: 'text/markdown',
      tipo: 'reglamento_copropiedad',
      titulo: 'Reglamento',
      visibleConsorcistas: true,
    })
    const resultado = await drenar({
      indexar_documento: manejadorIndexacion(
        almacen,
        asistenciaNula.vectores,
        textoPorPagina,
        bajar,
      ),
    })
    expect(resultado).toEqual({ despachados: 0, fallidos: 1 })
    const documento = await prismaBase.documentoConsorcio.findUniqueOrThrow({
      where: { id: documentoId },
    })
    expect(documento.estadoIndexacion).toBe('error')
    expect(documento.errorIndexacion).toMatch(/no está configurado/)
    const [trabajo] = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'indexar_documento' },
    })
    expect(trabajo.estado).toBe('pendiente')
  })
})
