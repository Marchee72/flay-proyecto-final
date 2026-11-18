import { readFileSync } from 'node:fs'

import type { Prisma, TipoDocumento, TipoSugerencia } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { disponible, type LectorDeConfiguracion } from '@/dominio/contratos/asistencia'
import { buscarConfiguracion, listarDocumentos } from '@/aplicacion/comunicacion/documentos'
import { manejadorIndexacion } from '@/aplicacion/comunicacion/indexar'
import {
  aplicarSugerencia,
  descartarSugerencia,
  listarSugerencias,
  manejadorSugerencias,
  SugerenciaYaResuelta,
} from '@/aplicacion/comunicacion/sugerencias'
import { cargarPadron } from '@/aplicacion/consorcios/unidades'
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
const repo = repositorioHabilitaciones
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

const sugerir = async (tipo: TipoSugerencia, datos: Prisma.InputJsonValue) =>
  (
    await prismaBase.sugerenciaConfiguracion.create({
      data: { consorcioId, documentoId, tipo, datos, cita: 'Lo dice el reglamento.' },
    })
  ).id

const estadoDe = (id: string) =>
  prismaBase.sugerenciaConfiguracion.findUniqueOrThrow({ where: { id } })

const quincho = () =>
  prismaBase.espacioComun.findFirstOrThrow({ where: { consorcioId, nombre: 'Quincho' } })

const tasaDeMora = async () =>
  (
    await prismaBase.consorcio.findUniqueOrThrow({ where: { id: consorcioId } })
  ).tasaMoraMensual.toFixed(4)

const dosTramos = () =>
  prismaBase.tramoVencimiento.createMany({
    data: [
      { consorcioId, orden: 1, diaDelMes: 10, recargoPorcentaje: '0' },
      { consorcioId, orden: 2, diaDelMes: 20, recargoPorcentaje: '5' },
    ],
  })

describe('aplicar y descartar sugerencias (RN-14)', () => {
  it('aplicar un espacio_nuevo crea el espacio por altaEspacio y marca quién y cuándo', async () => {
    const sumNuevo = await sugerir('espacio_nuevo', {
      nombre: 'SUM',
      horario: { apertura: '10:00', cierre: '23:00' },
      anticipacionMinimaHoras: 48,
    })
    await expect(
      aplicarSugerencia(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        sugerenciaId: sumNuevo,
      }),
    ).resolves.toEqual({ canceladas: 0 })

    const sum = await prismaBase.espacioComun.findFirstOrThrow({
      where: { consorcioId, nombre: 'SUM' },
    })
    expect([sum.aperturaMinutos, sum.cierreMinutos, sum.anticipacionMinimaHoras]).toEqual([
      600, 1380, 48,
    ])
    const fila = await estadoDe(sumNuevo)
    expect([fila.estado, fila.resueltaPor, fila.resueltaEn]).toEqual([
      'aplicada',
      administrador,
      RELOJ.ahora(),
    ])
  })

  it('aplicar un espacio_cambio mezcla con lo vigente: solo cambia lo sugerido', async () => {
    const antes = await quincho()
    await prismaBase.espacioComun.update({
      where: { id: antes.id },
      data: {
        capacidadMaxima: 20,
        aperturaMinutos: 600,
        cierreMinutos: 1200,
        rechazaConDeuda: true,
      },
    })
    const id = await sugerir('espacio_cambio', { espacioId: antes.id, duracionMaximaHoras: 6 })
    await aplicarSugerencia(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      sugerenciaId: id,
    })

    expect(await quincho()).toMatchObject({
      nombre: 'Quincho',
      duracionMaximaHoras: 6,
      capacidadMaxima: 20,
      aperturaMinutos: 600,
      cierreMinutos: 1200,
      rechazaConDeuda: true,
      anticipacionMinimaHoras: antes.anticipacionMinimaHoras,
      anticipacionMaximaDias: antes.anticipacionMaximaDias,
      reservasMaxMesUnidad: antes.reservasMaxMesUnidad,
    })
  })

  it('aplicar vencimientos con solo la mora conserva los tramos vigentes', async () => {
    await dosTramos()
    const id = await sugerir('vencimientos', { tasaMoraMensual: '7.0000' })
    await aplicarSugerencia(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      sugerenciaId: id,
    })

    expect(await tasaDeMora()).toBe('7.0000')
    const tramos = await prismaBase.tramoVencimiento.findMany({
      where: { consorcioId },
      orderBy: { orden: 'asc' },
    })
    expect(tramos.map((t) => [t.orden, t.diaDelMes, t.recargoPorcentaje.toFixed(4)])).toEqual([
      [1, 10, '0.0000'],
      [2, 20, '5.0000'],
    ])
  })

  it('si el caso de uso rechaza, la sugerencia sigue pendiente y el error es el del caso de uso', async () => {
    await dosTramos()
    const id = await sugerir('vencimientos', { tasaMoraMensual: '1.0000' })
    await expect(
      aplicarSugerencia(repo, RELOJ, { usuarioId: administrador, consorcioId, sugerenciaId: id }),
    ).rejects.toThrow('debe ser mayor que el recargo más alto')
    expect((await estadoDe(id)).estado).toBe('pendiente')
    expect(await tasaDeMora()).toBe('2.0000')
  })

  it('aplicar dos veces: la segunda es SugerenciaYaResuelta y no escribe', async () => {
    const id = await sugerir('instrucciones_pago', { texto: '  Alias flay.mitre  ' })
    const datos = { usuarioId: administrador, consorcioId, sugerenciaId: id }
    const instrucciones = async () =>
      (await prismaBase.consorcio.findUniqueOrThrow({ where: { id: consorcioId } }))
        .instruccionesPago
    await aplicarSugerencia(repo, RELOJ, datos)
    expect(await instrucciones()).toBe('Alias flay.mitre')

    await prismaBase.consorcio.update({
      where: { id: consorcioId },
      data: { instruccionesPago: 'Otra cosa' },
    })
    const segunda = aplicarSugerencia(repo, RELOJ, datos)
    await expect(segunda).rejects.toBeInstanceOf(SugerenciaYaResuelta)
    await expect(segunda).rejects.toThrow('Esta sugerencia ya se aplicó o se descartó.')
    expect(await instrucciones()).toBe('Otra cosa')
  })

  it('un cambio de horario aplicado cancela y devuelve cuántas; listar lo anticipaba', async () => {
    await cargarPadron(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      unidades: [{ designacion: '1A', coeficiente: '100.00000000' }],
    })
    const unidad = await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId } })
    const espacio = await quincho()
    // De 8 a 10 de la mañana, hora argentina: queda afuera de «de 10 a 23».
    const reserva = await prismaBase.reserva.create({
      data: {
        consorcioId,
        espacioId: espacio.id,
        unidadId: unidad.id,
        solicitadaPor: vecino,
        desde: new Date('2026-11-21T11:00:00Z'),
        hasta: new Date('2026-11-21T13:00:00Z'),
      },
    })
    const id = await sugerir('espacio_cambio', {
      espacioId: espacio.id,
      horario: { apertura: '10:00', cierre: '23:00' },
    })

    const [tarjeta] = await listarSugerencias(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      documentoId,
    })
    expect(tarjeta).toMatchObject({
      id,
      tipo: 'espacio_cambio',
      titulo: 'Cambios en Quincho',
      estado: 'pendiente',
      aplicable: true,
      reservasAfectadas: 1,
    })
    expect(tarjeta!.cambios.map((c) => c.campo)).toEqual(['Horario'])

    await expect(
      aplicarSugerencia(repo, RELOJ, { usuarioId: administrador, consorcioId, sugerenciaId: id }),
    ).resolves.toEqual({ canceladas: 1 })
    expect((await prismaBase.reserva.findUniqueOrThrow({ where: { id: reserva.id } })).estado).toBe(
      'cancelada',
    )
  })

  it('listar: pendientes primero, con título, cita y actual → propuesto', async () => {
    const aplicada = await sugerir('asambleas', { anticipacionDias: 20 })
    await aplicarSugerencia(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      sugerenciaId: aplicada,
    })
    await sugerir('espacio_nuevo', { nombre: 'SUM', anticipacionMinimaHoras: 48 })
    await sugerir('vencimientos', { tasaMoraMensual: '3.0000' })
    await sugerir('instrucciones_pago', { texto: 'Alias flay.mitre' })

    const lista = await listarSugerencias(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      documentoId,
    })
    expect(lista.map((s) => s.estado)).toEqual(['pendiente', 'pendiente', 'pendiente', 'aplicada'])
    expect(
      lista
        .slice(0, 3)
        .map((s) => s.titulo)
        .sort(),
    ).toEqual(['Instrucciones de pago', 'Nuevo espacio: SUM', 'Vencimientos y mora'])
    expect(lista[3]).toMatchObject({
      titulo: 'Reglas de asamblea',
      resueltaEn: RELOJ.ahora().toISOString(),
    })
    const porTitulo = (titulo: string) => lista.find((s) => s.titulo === titulo)!
    expect(porTitulo('Nuevo espacio: SUM')).toMatchObject({
      cita: 'Lo dice el reglamento.',
      aplicable: true,
      reservasAfectadas: 0,
      resueltaEn: null,
    })
    expect(porTitulo('Vencimientos y mora').cambios).toEqual([
      { campo: 'Tasa de mora mensual', actual: '2 %', propuesto: '3 %' },
    ])
  })

  it('espacio_cambio de un espacio deshabilitado: no aplicable, solo se descarta', async () => {
    const espacio = await quincho()
    await prismaBase.espacioComun.update({ where: { id: espacio.id }, data: { activo: false } })
    const id = await sugerir('espacio_cambio', { espacioId: espacio.id, duracionMaximaHoras: 6 })

    const [tarjeta] = await listarSugerencias(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      documentoId,
    })
    expect(tarjeta).toMatchObject({ id, aplicable: false, reservasAfectadas: 0 })

    const datos = { usuarioId: administrador, consorcioId, sugerenciaId: id }
    await expect(aplicarSugerencia(repo, RELOJ, datos)).rejects.toThrow('solo se puede descartar')
    expect((await estadoDe(id)).estado).toBe('pendiente')
    await descartarSugerencia(repo, RELOJ, datos)
    expect((await estadoDe(id)).estado).toBe('descartada')
  })

  it('descartar no toca la configuración', async () => {
    const id = await sugerir('instrucciones_pago', { texto: 'Alias flay.mitre' })
    const datos = { usuarioId: administrador, consorcioId, sugerenciaId: id }
    await descartarSugerencia(repo, RELOJ, datos)

    const fila = await estadoDe(id)
    expect([fila.estado, fila.resueltaPor, fila.resueltaEn]).toEqual([
      'descartada',
      administrador,
      RELOJ.ahora(),
    ])
    const consorcio = await prismaBase.consorcio.findUniqueOrThrow({ where: { id: consorcioId } })
    expect(consorcio.instruccionesPago).toBeNull()
    await expect(descartarSugerencia(repo, RELOJ, datos)).rejects.toBeInstanceOf(
      SugerenciaYaResuelta,
    )
    await expect(aplicarSugerencia(repo, RELOJ, datos)).rejects.toBeInstanceOf(SugerenciaYaResuelta)
  })

  it('consorcista: listar, aplicar y descartar son RolInsuficiente', async () => {
    const id = await sugerir('asambleas', { anticipacionDias: 20 })
    const datos = { usuarioId: vecino, consorcioId, sugerenciaId: id }
    await expect(
      listarSugerencias(repo, RELOJ, { usuarioId: vecino, consorcioId, documentoId }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
    await expect(aplicarSugerencia(repo, RELOJ, datos)).rejects.toBeInstanceOf(RolInsuficiente)
    await expect(descartarSugerencia(repo, RELOJ, datos)).rejects.toBeInstanceOf(RolInsuficiente)
    expect((await estadoDe(id)).estado).toBe('pendiente')
  })

  it('sugerencia de otro consorcio: NoEncontrado', async () => {
    const otro = await crearConsorcio((await crearAdministradora('Otra')).id, 'Ajeno 1')
    const documento = await prismaBase.documentoConsorcio.create({
      data: {
        consorcioId: otro.id,
        tipo: 'reglamento_interno',
        titulo: 'Ajeno',
        claveAlmacenamiento: `documentos/${otro.id}/${crypto.randomUUID()}/r.txt`,
        tipoContenido: 'text/plain',
        cargadoPor: administrador,
      },
    })
    const { id: ajena } = await prismaBase.sugerenciaConfiguracion.create({
      data: {
        consorcioId: otro.id,
        documentoId: documento.id,
        tipo: 'asambleas',
        datos: { anticipacionDias: 20 },
        cita: 'Ajena.',
      },
    })
    const datos = { usuarioId: administrador, consorcioId, sugerenciaId: ajena }
    await expect(aplicarSugerencia(repo, RELOJ, datos)).rejects.toBeInstanceOf(NoEncontrado)
    await expect(descartarSugerencia(repo, RELOJ, datos)).rejects.toBeInstanceOf(NoEncontrado)
    expect(
      await listarSugerencias(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        documentoId: documento.id,
      }),
    ).toEqual([])
    expect((await estadoDe(ajena)).estado).toBe('pendiente')
  })

  it('listarDocumentos da sugerenciasPendientes al administrador y null al resto', async () => {
    const otroDocumento = await sembrarDocumento('poliza')
    await sugerir('asambleas', { anticipacionDias: 20 })
    await sugerir('instrucciones_pago', { texto: 'Alias flay.mitre' })
    const descartada = await sugerir('vencimientos', { tasaMoraMensual: '3.0000' })
    await descartarSugerencia(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      sugerenciaId: descartada,
    })

    const pendientes = async (usuarioId: string) =>
      Object.fromEntries(
        (await listarDocumentos(repo, RELOJ, { usuarioId, consorcioId })).map((d) => [
          d.id,
          d.sugerenciasPendientes,
        ]),
      )
    expect(await pendientes(administrador)).toEqual({ [documentoId]: 2, [otroDocumento]: 0 })
    expect(await pendientes(vecino)).toEqual({ [documentoId]: null, [otroDocumento]: null })
  })
})
