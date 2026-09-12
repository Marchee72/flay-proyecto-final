import { readFileSync } from 'node:fs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import {
  confirmarExtraccion,
  descartarExtraccion,
  iniciarCargaAsistida,
  manejadorExtraccion,
  verExtraccion,
} from '@/aplicacion/gastos/extraccion'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { asistenciaDeterminista } from '@/infraestructura/asistencia/determinista'
import { asistenciaNula } from '@/infraestructura/asistencia/nula'
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
 * Carga asistida (`RF-06`, `CU-13`, regla RN-14 § 7.2): la extraccion propone,
 * la persona confirma, el gasto nace ahi y solo ahi (SC-017); lo corregido
 * queda registrado; con la nula, formulario vacio (SC-013); una salida fuera
 * de esquema equivale a no disponible (PI-04).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones
const PDF = new Uint8Array(readFileSync('datos-cliente/comprobantes/archivos/C01.pdf'))

let consorcioId: string
let administrador: string
let periodoId: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [{ designacion: '1A', coeficiente: '100.00000000' }],
  })
  await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Energia electrica' },
    update: {},
    create: { nombre: 'Energia electrica', clasificacion: 'ordinario' },
  })
  periodoId = (
    await abrirPeriodo(repo, RELOJ, { usuarioId: administrador, consorcioId, anio: 2026, mes: 9 })
  ).periodoId
})

afterEach(async () => {
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

async function subirYExtraer(asistencia = asistenciaDeterminista) {
  const clave = `extracciones/${consorcioId}/${crypto.randomUUID()}/C01.pdf`
  const { almacen, bajar } = almacenEnMemoria({ [clave]: PDF })
  const { extraccionId } = await iniciarCargaAsistida(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    clave,
    tipoContenido: 'application/pdf',
  })
  await drenar({
    extraccion_comprobante: manejadorExtraccion(almacen, asistencia.extractor, bajar),
  })
  return { extraccionId, almacen }
}

describe('extraccion y confirmacion', () => {
  it('propone los cinco campos como cadena y el gasto nace al confirmar, con lo corregido anotado', async () => {
    const { extraccionId, almacen } = await subirYExtraer()
    const vista = await verExtraccion(almacen, repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
    })
    expect(vista.estado).toBe('propuesta')
    expect(vista.propuesta.cuit).toBe('30-50873849-1')
    expect(vista.propuesta.fecha).toBe('2026-05-06')
    expect(vista.propuesta.importe).toBe('96500.00')
    // La determinista elige por palabras y la factura de luz tiene un item «Impuestos y tasas»:
    // lo que importa es que propone un rubro y que cambiarlo queda anotado.
    expect(vista.propuesta.rubroId).not.toBeNull()
    expect(typeof vista.propuesta.importe).toBe('string')

    // Antes de confirmar: cero gastos (SC-017).
    expect(await prismaBase.gasto.count({ where: { consorcioId } })).toBe(0)

    const energia = await prismaBase.rubroGasto.findUniqueOrThrow({
      where: { nombre: 'Energia electrica' },
    })
    const { gastoId, camposCorregidos } = await confirmarExtraccion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
      periodoId,
      rubroId: energia.id,
      importe: '96000.00',
      fecha: new Date('2026-05-06T00:00:00Z'),
      descripcion: 'EPE mayo',
    })
    expect(camposCorregidos.sort()).toEqual(
      vista.propuesta.rubroId === energia.id ? ['importe'] : ['importe', 'rubro'],
    )
    const gasto = await prismaBase.gasto.findUniqueOrThrow({
      where: { id: gastoId },
      include: { comprobantes: true },
    })
    expect(gasto.importe.toFixed(2)).toBe('96000.00')
    expect(gasto.comprobantes).toHaveLength(1)
    const extraccion = await prismaBase.extraccionComprobante.findUniqueOrThrow({
      where: { id: extraccionId },
    })
    expect(extraccion.estado).toBe('corregida')
    expect(extraccion.gastoId).toBe(gastoId)
    expect(extraccion.confirmadaPor).toBe(administrador)

    // Ninguna fila de Gasto nace de una extraccion sin confirmar (SC-017).
    const sinConfirmar = await prismaBase.extraccionComprobante.count({
      where: { gastoId: { not: null }, confirmadaPor: null },
    })
    expect(sinConfirmar).toBe(0)
  })

  it('confirmar sin cambios queda como confirmada; descartar no crea nada', async () => {
    const { extraccionId, almacen } = await subirYExtraer()
    const vista = await verExtraccion(almacen, repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
    })
    await confirmarExtraccion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
      periodoId,
      rubroId: vista.propuesta.rubroId!,
      importe: vista.propuesta.importe!,
      fecha: new Date(`${vista.propuesta.fecha}T00:00:00Z`),
      descripcion: 'EPE mayo',
    })
    expect(
      (await prismaBase.extraccionComprobante.findUniqueOrThrow({ where: { id: extraccionId } }))
        .estado,
    ).toBe('confirmada')

    const otra = await subirYExtraer()
    await descartarExtraccion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId: otra.extraccionId,
    })
    expect(
      (
        await prismaBase.extraccionComprobante.findUniqueOrThrow({
          where: { id: otra.extraccionId },
        })
      ).estado,
    ).toBe('descartada')
    expect(await prismaBase.gasto.count({ where: { consorcioId } })).toBe(1)
  })

  it('con la nula queda no_disponible y el formulario vacio; igual se puede cargar a mano (SC-013)', async () => {
    const { extraccionId, almacen } = await subirYExtraer(asistenciaNula)
    const vista = await verExtraccion(almacen, repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
    })
    expect(vista.estado).toBe('no_disponible')
    expect(vista.propuesta.importe).toBeNull()
    const rubro = await prismaBase.rubroGasto.findUniqueOrThrow({
      where: { nombre: 'Energia electrica' },
    })
    const { gastoId } = await confirmarExtraccion(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
      periodoId,
      rubroId: rubro.id,
      importe: '96500.00',
      fecha: new Date('2026-05-06T00:00:00Z'),
      descripcion: 'EPE mayo, a mano',
    })
    expect(gastoId).toBeTruthy()
  })

  it('una salida fuera de esquema equivale a servicio no disponible (PI-04)', async () => {
    const rota = {
      ...asistenciaDeterminista,
      extractor: {
        async extraer() {
          // Lo que un proveedor nunca deberia devolver: la interfaz lo hace imposible, pero
          // el manejador tampoco confia: el importe invalido no se persiste.
          return {
            disponible: true as const,
            valor: {
              proveedor: 'X',
              cuit: 'no-es-cuit',
              fecha: 'ayer',
              importe: 'mucho',
              rubroCodigo: 'R99',
              confianza: '0.100',
              confianzaPorCampo: {
                proveedor: '0',
                cuit: '0',
                fecha: '0',
                importe: '0',
                rubro: '0',
              },
            },
          }
        },
      },
    }
    const { extraccionId, almacen } = await subirYExtraer(rota)
    const vista = await verExtraccion(almacen, repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
    })
    expect(vista.propuesta.importe).toBeNull()
    expect(vista.propuesta.fecha).toBeNull()
    expect(vista.propuesta.rubroId).toBeNull()
  })

  it('con confianza global baja no se precarga ningun campo, ni los que parecen bien (PI-02, CU-06 3b)', async () => {
    const borrosa = {
      ...asistenciaDeterminista,
      extractor: {
        async extraer() {
          // Lo que dio el proveedor real sobre una foto borrosa: proveedor y CUIT
          // legibles, fecha e importe inventados, confianza 0,300.
          return {
            disponible: true as const,
            valor: {
              proveedor: 'Servicios Generales SRL',
              cuit: '30-71234567-8',
              fecha: '2023-10-15',
              importe: '125000.00',
              rubroCodigo: null,
              confianza: '0.300',
              confianzaPorCampo: {
                proveedor: '0.300',
                cuit: '0.300',
                fecha: '0.300',
                importe: '0.300',
                rubro: '0.100',
              },
            },
          }
        },
      },
    }
    const { extraccionId, almacen } = await subirYExtraer(borrosa)
    const vista = await verExtraccion(almacen, repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      extraccionId,
    })
    expect(vista.estado).toBe('propuesta')
    expect(vista.propuesta.confianza).toBe('0.300')
    expect(vista.propuesta.proveedor).toBeNull()
    expect(vista.propuesta.cuit).toBeNull()
    expect(vista.propuesta.importe).toBeNull()
    expect(vista.propuesta.fecha).toBeNull()
  })
})
