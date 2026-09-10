import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AlmacenObjetos, PermisoDeSubida } from '@/dominio/contratos/almacen-objetos'
import { BYTES_MAXIMOS_COMPROBANTE } from '@/dominio/contratos/almacen-objetos'
import { NoEncontrado } from '@/compartido/errores'
import {
  ComprobanteDemasiadoGrande,
  confirmarComprobante,
  pedirPermisoDeSubida,
  TipoDeComprobanteNoAceptado,
  verComprobante,
} from '@/aplicacion/gastos/comprobantes'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
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
 * SC-006c y FR-018. Lo que se verifica es **el orden**: tipo y tamano se
 * rechazan antes de tocar el almacenamiento, no despues de subir 26 MB.
 *
 * El almacen es un doble, y no por comodidad: probar contra el proveedor real
 * mediria la red del que corre las pruebas, no la regla. Lo que el doble
 * permite afirmar —y con el proveedor real seria imposible— es que en el
 * camino de rechazo **no se lo llamo ni una vez**.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const repo = repositorioHabilitaciones

let llamadas: { clave: string; tipo: string; bytesMaximos: number }[] = []

const almacenDoble: AlmacenObjetos = {
  async emitirPermisoDeSubida(clave, tipoContenido, bytesMaximos): Promise<PermisoDeSubida> {
    llamadas.push({ clave, tipo: tipoContenido, bytesMaximos })
    return { clave, credencial: 'credencial-de-prueba', vence: new Date('2026-09-09T12:10:00Z') }
  },
  async resolverLecturaAutorizada(clave: string): Promise<string> {
    return `https://almacen.test/${clave}`
  },
  async eliminar(): Promise<void> {},
}

let consorcioId: string
let ajeno: string
let administrador: string
let gastoId: string

beforeEach(async () => {
  llamadas = []
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  ajeno = (await crearConsorcio(administradora.id, 'Ajeno 100')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  await habilitarEnConsorcio(administrador, ajeno, 'administrador')

  const rubro = await prismaBase.rubroGasto.upsert({
    where: { nombre: 'Rubro de prueba' },
    update: {},
    create: { nombre: 'Rubro de prueba', clasificacion: 'ordinario' },
  })

  const { periodoId } = await abrirPeriodo(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    anio: 2026,
    mes: 9,
  })

  const gasto = await registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId: rubro.id,
    importe: '15000.00',
    fecha: new Date('2026-09-05'),
    descripcion: 'Factura de prueba',
  })

  gastoId = gasto.gastoId
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Comprobante"`
  await prismaBase.$executeRaw`DELETE FROM "Gasto"`
  await prismaBase.$executeRaw`DELETE FROM "Periodo"`
  await limpiar()
})

const pedir = (bytes: number, tipo = 'application/pdf', gasto = gastoId, consorcio = consorcioId) =>
  pedirPermisoDeSubida(almacenDoble, repo, RELOJ, {
    usuarioId: administrador,
    consorcioId: consorcio,
    gastoId: gasto,
    tipoContenido: tipo,
    bytes,
    nombre: 'factura de septiembre.pdf',
  })

describe('permiso de subida (FR-018, SC-006c)', () => {
  it('25 MB pasa y el permiso lleva el limite adentro', async () => {
    const permiso = await pedir(BYTES_MAXIMOS_COMPROBANTE)

    expect(permiso.credencial).toBe('credencial-de-prueba')
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].bytesMaximos).toBe(BYTES_MAXIMOS_COMPROBANTE)
    // La clave lleva el consorcio adelante: dos consorcios no comparten prefijo.
    expect(permiso.clave.startsWith(`comprobantes/${consorcioId}/${gastoId}/`)).toBe(true)
    // El nombre viaja limpio: sin espacios ni rutas.
    expect(permiso.clave.endsWith('factura-de-septiembre.pdf')).toBe(true)
  })

  it('26 MB se rechaza **antes** de tocar el almacenamiento', async () => {
    await expect(pedir(BYTES_MAXIMOS_COMPROBANTE + 1_048_576)).rejects.toBeInstanceOf(
      ComprobanteDemasiadoGrande,
    )

    expect(llamadas).toHaveLength(0)
    expect(await prismaBase.comprobante.count()).toBe(0)
  })

  it('el rechazo dice cuanto pesa y cual es el limite (RNF-10)', async () => {
    await expect(pedir(BYTES_MAXIMOS_COMPROBANTE + 1_048_576)).rejects.toThrow(/26\.0 MB/)
    await expect(pedir(BYTES_MAXIMOS_COMPROBANTE + 1_048_576)).rejects.toThrow(/25 MB/)
  })

  it('un tipo que no aceptamos tampoco llega al almacenamiento', async () => {
    await expect(pedir(1000, 'application/zip')).rejects.toBeInstanceOf(TipoDeComprobanteNoAceptado)
    expect(llamadas).toHaveLength(0)
  })

  it('un gasto de otro consorcio no se encuentra, no se prohibe (SC-002)', async () => {
    await expect(pedir(1000, 'application/pdf', gastoId, ajeno)).rejects.toBeInstanceOf(
      NoEncontrado,
    )
    expect(llamadas).toHaveLength(0)
  })

  it('deja el trabajo pendiente que va a buscar la confirmacion (FR-006b)', async () => {
    await pedir(1000)

    const pendientes = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'confirmacion_subida' },
    })

    expect(pendientes).toHaveLength(1)
    expect(pendientes[0].estado).toBe('pendiente')
  })
})

describe('confirmacion y lectura (FR-018b, FR-018c)', () => {
  it('el comprobante nace pendiente y la confirmacion lo deja disponible', async () => {
    const permiso = await pedir(1000)

    const antes = await prismaBase.comprobante.findFirstOrThrow({ where: { gastoId } })
    expect(antes.estado).toBe('pendiente')

    await confirmarComprobante(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      gastoId,
      clave: permiso.clave,
    })

    const despues = await prismaBase.comprobante.findFirstOrThrow({ where: { gastoId } })
    expect(despues.estado).toBe('disponible')

    const trabajo = await prismaBase.trabajoPendiente.findFirstOrThrow({
      where: { tipo: 'confirmacion_subida' },
    })
    expect(trabajo.estado).toBe('despachado')
  })

  it('uno sin confirmar no se puede ver: todavia no esta', async () => {
    await pedir(1000)
    const comprobante = await prismaBase.comprobante.findFirstOrThrow({ where: { gastoId } })

    await expect(
      verComprobante(almacenDoble, repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        comprobanteId: comprobante.id,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
  })

  it('HEIC se marca como de sola descarga, con la razon a la vista (FR-018c)', async () => {
    const permiso = await pedir(1000, 'image/heic')
    await confirmarComprobante(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      gastoId,
      clave: permiso.clave,
    })

    const comprobante = await prismaBase.comprobante.findFirstOrThrow({ where: { gastoId } })
    const visible = await verComprobante(almacenDoble, repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      comprobanteId: comprobante.id,
    })

    expect(visible.soloDescarga).toBe(true)
    expect(visible.direccion).toContain(permiso.clave)
  })

  it('un PDF si se muestra incrustado', async () => {
    const permiso = await pedir(1000)
    await confirmarComprobante(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      gastoId,
      clave: permiso.clave,
    })

    const comprobante = await prismaBase.comprobante.findFirstOrThrow({ where: { gastoId } })
    const visible = await verComprobante(almacenDoble, repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      comprobanteId: comprobante.id,
    })

    expect(visible.soloDescarga).toBe(false)
  })

  it('el comprobante de otro consorcio devuelve «no encontrado», nunca «prohibido»', async () => {
    const permiso = await pedir(1000)
    await confirmarComprobante(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      gastoId,
      clave: permiso.clave,
    })

    const comprobante = await prismaBase.comprobante.findFirstOrThrow({ where: { gastoId } })

    await expect(
      verComprobante(almacenDoble, repo, RELOJ, {
        usuarioId: administrador,
        // Habilitado en los dos, pero el comprobante no es de este.
        consorcioId: ajeno,
        comprobanteId: comprobante.id,
      }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })
})
