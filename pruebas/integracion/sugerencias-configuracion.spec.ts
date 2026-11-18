import { readFileSync } from 'node:fs'

import type { TipoDocumento } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RolInsuficiente } from '@/compartido/errores'
import { disponible, type LectorDeConfiguracion } from '@/dominio/contratos/asistencia'
import { buscarConfiguracion } from '@/aplicacion/comunicacion/documentos'
import { manejadorIndexacion } from '@/aplicacion/comunicacion/indexar'
import { manejadorSugerencias } from '@/aplicacion/comunicacion/sugerencias'
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
 * Sugerencias de configuración desde la documentación (`RF-19`, RN-14): el
 * análisis las deja pendientes con su cita; nada se aplica acá.
 */

const RELOJ = relojFijo('2026-11-18T12:00:00Z')
const REGLAMENTO = readFileSync('pruebas/fixtures/reglamento-de-prueba.txt', 'utf8')

let consorcioId: string
let administrador: string
let vecino: string
let documentoId: string

async function sembrarDocumento(
  tipo: TipoDocumento = 'reglamento_interno',
  estadoIndexacion: 'indexado' | 'pendiente' = 'indexado',
) {
  const documento = await prismaBase.documentoConsorcio.create({
    data: {
      consorcioId,
      tipo,
      titulo: 'Reglamento',
      claveAlmacenamiento: `documentos/${consorcioId}/${crypto.randomUUID()}/r.txt`,
      tipoContenido: 'text/plain',
      estadoIndexacion,
      cargadoPor: administrador,
    },
  })
  // Dos fragmentos, guardados al revés: el manejador los tiene que unir en orden.
  const [primero, segundo] = REGLAMENTO.split('Capitulo 6.')
  await prismaBase.fragmentoDocumento.createMany({
    data: [
      { documentoId: documento.id, numeroFragmento: 2, contenido: `Capitulo 6.${segundo}` },
      { documentoId: documento.id, numeroFragmento: 1, contenido: primero! },
    ],
  })
  return documento.id
}

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  vecino = (await crearUsuario('Beto')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(vecino, consorcioId, 'consorcista')
  await prismaBase.espacioComun.create({ data: { consorcioId, nombre: 'Quincho' } })
  documentoId = await sembrarDocumento()
})

afterEach(limpiar)

const analizar = (
  lector: LectorDeConfiguracion = asistenciaDeterminista.lector,
  id = documentoId,
) => manejadorSugerencias(lector)({ documentoId: id })

const sugerencias = () =>
  prismaBase.sugerenciaConfiguracion.findMany({ where: { documentoId }, orderBy: { tipo: 'asc' } })

describe('sugerencias de configuración', () => {
  it('el análisis guarda las sugerencias con su cita, pendientes', async () => {
    await analizar()
    const filas = await sugerencias()
    expect(filas.map((f) => f.tipo).sort()).toEqual([
      'espacio_cambio',
      'espacio_nuevo',
      'vencimientos',
    ])
    expect(filas.every((f) => f.estado === 'pendiente' && f.cita.length > 0)).toBe(true)
    expect(filas.every((f) => f.consorcioId === consorcioId)).toBe(true)
    const quincho = await prismaBase.espacioComun.findFirstOrThrow({ where: { nombre: 'Quincho' } })
    const cambio = filas.find((f) => f.tipo === 'espacio_cambio')!
    expect(cambio.datos).toEqual({ espacioId: quincho.id, duracionMaximaHoras: 6 })
  })

  it('reanalizar reemplaza las pendientes y conserva las aplicadas y descartadas', async () => {
    await analizar()
    const descartada = (await sugerencias()).find((f) => f.tipo === 'vencimientos')!
    await prismaBase.sugerenciaConfiguracion.update({
      where: { id: descartada.id },
      data: { estado: 'descartada', resueltaPor: administrador, resueltaEn: new Date() },
    })

    await analizar()
    const filas = await sugerencias()
    expect(filas).toHaveLength(4)
    expect(filas.filter((f) => f.estado === 'descartada').map((f) => f.id)).toEqual([descartada.id])
    expect(
      filas
        .filter((f) => f.estado === 'pendiente')
        .map((f) => f.tipo)
        .sort(),
    ).toEqual(['espacio_cambio', 'espacio_nuevo', 'vencimientos'])
  })

  it('una sugerencia igual a la configuración vigente no se guarda', async () => {
    await prismaBase.consorcio.update({
      where: { id: consorcioId },
      data: { tasaMoraMensual: '3.0000' },
    })
    await prismaBase.espacioComun.updateMany({
      where: { consorcioId, nombre: 'Quincho' },
      data: { duracionMaximaHoras: 6 },
    })
    await analizar()
    expect((await sugerencias()).map((f) => f.tipo)).toEqual(['espacio_nuevo'])
  })

  it('una sugerencia inválida se descarta y el resto se guarda', async () => {
    const otro = await crearConsorcio((await crearAdministradora('Otra')).id, 'Ajeno 1')
    const ajeno = await prismaBase.espacioComun.create({
      data: { consorcioId: otro.id, nombre: 'Pileta' },
    })
    const doble: LectorDeConfiguracion = {
      async leer() {
        return disponible([
          {
            tipo: 'espacio_cambio',
            espacioId: ajeno.id,
            cita: 'La pileta abre a las 9.',
            datos: { duracionMaximaHoras: 2 },
          },
          {
            tipo: 'vencimientos',
            cita: 'Vence el día 31.',
            datos: { tramos: [{ diaDelMes: 31, recargoPorcentaje: '0' }] },
          },
          {
            tipo: 'asambleas',
            cita: 'Se convoca con 20 días de anticipación.',
            datos: { anticipacionDias: 20 },
          },
        ])
      },
    }
    await expect(analizar(doble)).resolves.toBeUndefined()
    const filas = await sugerencias()
    expect(filas.map((f) => [f.tipo, f.datos])).toEqual([['asambleas', { anticipacionDias: 20 }]])
  })

  it('con la nula no queda nada y el trabajo no lanza', async () => {
    await expect(analizar(asistenciaNula.lector)).resolves.toBeUndefined()
    expect(await sugerencias()).toEqual([])
  })

  it('documento borrado mientras esperaba: termina sin lanzar', async () => {
    await prismaBase.documentoConsorcio.delete({ where: { id: documentoId } })
    await expect(analizar()).resolves.toBeUndefined()
    expect(await prismaBase.sugerenciaConfiguracion.count()).toBe(0)
  })

  it('la indexación encola el análisis solo para reglamento, acta y contrato', async () => {
    const reglamento = await sembrarDocumento('reglamento_interno', 'pendiente')
    const poliza = await sembrarDocumento('poliza', 'pendiente')
    const archivos: Record<string, Uint8Array> = {}
    for (const id of [reglamento, poliza]) {
      const { claveAlmacenamiento } = await prismaBase.documentoConsorcio.findUniqueOrThrow({
        where: { id },
      })
      archivos[claveAlmacenamiento] = new TextEncoder().encode(REGLAMENTO)
    }
    const { almacen, bajar } = almacenEnMemoria(archivos)
    const indexar = manejadorIndexacion(
      almacen,
      asistenciaDeterminista.vectores,
      textoPorPagina,
      bajar,
    )
    await indexar({ documentoId: poliza })
    await indexar({ documentoId: reglamento })

    const trabajos = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'sugerir_configuracion' },
    })
    expect(trabajos.map((t) => t.carga)).toEqual([{ documentoId: reglamento }])
  })

  it('buscarConfiguracion: el administrador encola; el consorcista no; la póliza no', async () => {
    const trabajos = () =>
      prismaBase.trabajoPendiente.findMany({ where: { tipo: 'sugerir_configuracion' } })

    await buscarConfiguracion(repositorioHabilitaciones, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      documentoId,
    })
    expect((await trabajos()).map((t) => t.carga)).toEqual([{ documentoId }])

    await expect(
      buscarConfiguracion(repositorioHabilitaciones, RELOJ, {
        usuarioId: vecino,
        consorcioId,
        documentoId,
      }),
    ).rejects.toBeInstanceOf(RolInsuficiente)

    const poliza = await sembrarDocumento('poliza')
    await expect(
      buscarConfiguracion(repositorioHabilitaciones, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        documentoId: poliza,
      }),
    ).rejects.toThrow('Este documento no se analiza para configuración.')

    const sinIndexar = await sembrarDocumento('reglamento_interno', 'pendiente')
    await expect(
      buscarConfiguracion(repositorioHabilitaciones, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        documentoId: sinIndexar,
      }),
    ).rejects.toThrow('Este documento no se analiza para configuración.')
    expect(await trabajos()).toHaveLength(1)
  })
})
