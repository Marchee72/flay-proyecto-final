import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cargarDocumento, listarDocumentos } from '@/aplicacion/comunicacion/documentos'
import { listarNovedades, publicarNovedad } from '@/aplicacion/comunicacion/novedades'
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
 * Novedades y documentacion (`RF-18`, `RF-19`, `CU-12`, `CU-15`): la novedad
 * avisa a todos los habilitados del consorcio y a nadie de otro; el documento
 * no visible queda fuera de la lista del consorcista (escenario 4 de US5); el
 * documento nace pendiente con su trabajo de indexacion (FR-030).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let otroConsorcioId: string
let administrador: string
let vecino: string
let consejo: string
let ajeno: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  otroConsorcioId = (await crearConsorcio(administradora.id, 'San Martin 7890')).id
  administrador = (await crearUsuario('Ada')).id
  vecino = (await crearUsuario('Beto')).id
  consejo = (await crearUsuario('Caro')).id
  ajeno = (await crearUsuario('Dani')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
  await habilitarEnConsorcio(consejo, consorcioId, 'consejo')
  await habilitarEnConsorcio(ajeno, otroConsorcioId, 'consorcista')
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await limpiar()
})

describe('novedades', () => {
  it('publicar avisa a cada habilitado del consorcio, salvo a quien publica, y a nadie de otro', async () => {
    const { avisados } = await publicarNovedad(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      titulo: 'Corte de agua',
      cuerpo: 'El jueves de 9 a 12 por obras en la calle.',
      fijada: true,
    })
    expect(avisados).toBe(2)
    const avisos = await prismaBase.notificacion.findMany({ where: { tipo: 'novedad' } })
    expect(avisos.map((a) => a.usuarioId).sort()).toEqual([vecino, consejo].sort())
    expect(await prismaBase.trabajoPendiente.count({ where: { tipo: 'notificacion' } })).toBe(2)

    const delVecino = await listarNovedades(repo, RELOJ, { usuarioId: vecino, consorcioId })
    expect(delVecino.map((n) => n.titulo)).toEqual(['Corte de agua'])
    const delAjeno = await listarNovedades(repo, RELOJ, {
      usuarioId: ajeno,
      consorcioId: otroConsorcioId,
    })
    expect(delAjeno).toEqual([])
    await expect(
      publicarNovedad(repo, RELOJ, { usuarioId: vecino, consorcioId, titulo: 'x', cuerpo: 'y' }),
    ).rejects.toThrow('Tu rol no permite')
  })
})

describe('documentos', () => {
  const cargar = (titulo: string, visibleConsorcistas: boolean) =>
    cargarDocumento(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      clave: `documentos/${consorcioId}/${crypto.randomUUID()}/${titulo}.pdf`,
      tipoContenido: 'application/pdf',
      tipo: visibleConsorcistas ? 'reglamento_copropiedad' : 'contrato',
      titulo,
      visibleConsorcistas,
    })

  it('el no visible queda fuera de la lista del consorcista y dentro de la del administrador y el consejo', async () => {
    await cargar('Reglamento', true)
    await cargar('Contrato de limpieza', false)

    const titulos = async (usuarioId: string) =>
      (await listarDocumentos(repo, RELOJ, { usuarioId, consorcioId })).map((d) => d.titulo).sort()
    expect(await titulos(vecino)).toEqual(['Reglamento'])
    expect(await titulos(consejo)).toEqual(['Contrato de limpieza', 'Reglamento'])
    expect(await titulos(administrador)).toEqual(['Contrato de limpieza', 'Reglamento'])
  })

  it('nace pendiente con su trabajo de indexacion, y una clave ajena no se confirma', async () => {
    const { documentoId } = await cargar('Acta 2026', true)
    const documento = await prismaBase.documentoConsorcio.findUniqueOrThrow({
      where: { id: documentoId },
    })
    expect(documento.estadoIndexacion).toBe('pendiente')
    const trabajos = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'indexar_documento' },
    })
    expect(trabajos).toHaveLength(1)
    expect(trabajos[0].carga).toEqual({ documentoId })

    await expect(
      cargarDocumento(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        clave: `documentos/${otroConsorcioId}/x/y.pdf`,
        tipoContenido: 'application/pdf',
        tipo: 'acta',
        titulo: 'Ajena',
        visibleConsorcistas: true,
      }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })
})
