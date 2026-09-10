import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AlmacenObjetos } from '@/dominio/contratos/almacen-objetos'
import { cargarPadron, cambiarCoeficiente } from '@/aplicacion/consorcios/unidades'
import { confirmarComprobante, pedirPermisoDeSubida } from '@/aplicacion/gastos/comprobantes'
import { registrarGasto } from '@/aplicacion/gastos/registrar-gasto'
import { abrirPeriodo } from '@/aplicacion/periodos/periodos'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
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
 * SC-007: las **cinco** tablas económicas de la etapa dejan asiento, con imagen
 * anterior y posterior, y **exactamente uno por operación**.
 *
 * Que el disparador sea genérico ya se probó en `bitacora.spec.ts` sobre una
 * tabla de juguete, junto con los tres denegados de SC-008. Lo que se verifica
 * acá es otra cosa: que cada tabla de **esta** etapa quedó efectivamente
 * enganchada. Un disparador que funciona y una tabla a la que nadie se lo
 * conectó se ven igual hasta que hace falta la auditoría.
 *
 * Las operaciones pasan por los casos de uso, no por consultas crudas: lo que
 * tiene que quedar auditado es el camino que la aplicación usa de verdad.
 */

const RELOJ = relojFijo('2026-09-09T12:00:00Z')
const repo = repositorioHabilitaciones

const TABLAS_ECONOMICAS = ['Unidad', 'CoeficienteHistorico', 'Periodo', 'Gasto', 'Comprobante']

const almacenDoble: AlmacenObjetos = {
  async emitirPermisoDeSubida(clave) {
    return { clave, credencial: 'credencial-de-prueba', vence: new Date('2026-09-09T12:10:00Z') }
  },
  async resolverLecturaAutorizada(clave) {
    return `https://almacen.test/${clave}`
  },
  async eliminar() {},
}

interface Asiento {
  operacion: string
  usuario: string
  anterior: Record<string, unknown> | null
  posterior: Record<string, unknown> | null
}

const asientosDe = (tabla: string, clave: string) =>
  prismaBase.$queryRaw<Asiento[]>`
    SELECT operacion::text, usuario, anterior, posterior
    FROM "BitacoraAuditoria"
    WHERE tabla = ${tabla} AND clave = ${clave}
    ORDER BY momento, creado_en
  `

let consorcioId: string
let administrador: string
let claves: Record<string, string>
/** Todo lo escrito en esta corrida, para contar sin arrastrar corridas viejas. */
let deLaCorrida: string[]

beforeEach(async () => {
  // La bitacora **no se limpia**: flay_app no puede borrarla, que es justo lo
  // que promete SC-008. Cada afirmacion se acota a las filas de esta corrida.
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Auditoría 100')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')

  // Unidad y CoeficienteHistorico: dos altas y, en la unidad A, un cambio.
  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', coeficiente: '50.00000000' },
      { designacion: '1B', coeficiente: '50.00000000' },
    ],
  })

  const { unidades } = await verConsorcio(repo, RELOJ, { usuarioId: administrador, consorcioId })

  await cambiarCoeficiente(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId: unidades[0].id,
    coeficiente: '60.00000000',
    // Desde hoy, para que ademas de la historia se mueva la unidad.
    vigenciaDesde: RELOJ.hoy(),
    ajustes: [{ unidadId: unidades[1].id, coeficiente: '40.00000000' }],
  })

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

  const { gastoId } = await registrarGasto(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    periodoId,
    rubroId: rubro.id,
    importe: '15000.00',
    fecha: new Date('2026-09-05'),
    descripcion: 'Factura auditada',
  })

  // Comprobante: nace pendiente y la confirmacion lo mueve a disponible.
  const permiso = await pedirPermisoDeSubida(almacenDoble, repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    gastoId,
    tipoContenido: 'application/pdf',
    bytes: 2048,
    nombre: 'factura.pdf',
  })

  await confirmarComprobante(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    gastoId,
    clave: permiso.clave,
  })

  const comprobante = await prismaBase.comprobante.findFirstOrThrow({ where: { gastoId } })
  const historico = await prismaBase.coeficienteHistorico.findFirstOrThrow({
    where: { unidadId: unidades[0].id },
    orderBy: { creadoEn: 'asc' },
  })

  claves = {
    Unidad: unidades[0].id,
    CoeficienteHistorico: historico.id,
    Periodo: periodoId,
    Gasto: gastoId,
    Comprobante: comprobante.id,
  }

  const historia = await prismaBase.coeficienteHistorico.findMany({ select: { id: true } })

  deLaCorrida = [
    ...unidades.map((u) => u.id),
    ...historia.map((h) => h.id),
    periodoId,
    gastoId,
    comprobante.id,
  ]
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Comprobante"`
  await prismaBase.$executeRaw`DELETE FROM "Gasto"`
  await prismaBase.$executeRaw`DELETE FROM "Periodo"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await prismaBase.$executeRaw`DELETE FROM "Unidad"`
  await limpiar()
})

describe('auditoría de la etapa (SC-007, FR-025)', () => {
  it('las cinco tablas económicas dejan asiento, y ninguna quedó sin enganchar', async () => {
    for (const tabla of TABLAS_ECONOMICAS) {
      const asientos = await asientosDe(tabla, claves[tabla])
      expect(asientos.length, `${tabla} no dejó ningún asiento`).toBeGreaterThan(0)
      expect(asientos[0].operacion, `${tabla} sin alta`).toBe('INSERTA')
    }
  })

  it('el alta deja imagen posterior y ninguna anterior', async () => {
    for (const tabla of TABLAS_ECONOMICAS) {
      const [alta] = await asientosDe(tabla, claves[tabla])
      expect(alta.anterior, `${tabla}: el alta no tiene por qué traer imagen anterior`).toBeNull()
      expect(alta.posterior, `${tabla} sin imagen posterior`).not.toBeNull()
    }
  })

  it('el asiento lo firma el rol de la aplicación, no el propietario', async () => {
    for (const tabla of TABLAS_ECONOMICAS) {
      const asientos = await asientosDe(tabla, claves[tabla])
      expect(
        asientos.every((a) => a.usuario === 'flay_app'),
        `${tabla}`,
      ).toBe(true)
    }
  })

  it('un cambio deja exactamente un asiento, con las dos imágenes y distintas', async () => {
    // La unidad paso de 50 a 60 al cambiar el coeficiente desde hoy.
    const asientos = await asientosDe('Unidad', claves.Unidad)
    const cambios = asientos.filter((a) => a.operacion === 'MODIFICA')

    expect(cambios).toHaveLength(1)

    // `to_jsonb` serializa un NUMERIC como **numero** JSON, no como cadena: en
    // la base los digitos quedan enteros, pero al leer el asiento desde
    // JavaScript pasan por punto flotante. Con coeficientes (<= 100) e importes
    // de hasta catorce digitos significativos no se pierde nada, y por eso la
    // afirmacion compara numeros. Si alguna vez la bitacora se lee para
    // reconstruir dinero, el asiento tiene que volver como cadena.
    // ponytail: se arregla en fn_auditar() castando los NUMERIC a texto, que es
    // tocar el disparador generico de 001 y remigrar.
    expect(Number(cambios[0].anterior?.coeficiente)).toBe(50)
    expect(Number(cambios[0].posterior?.coeficiente)).toBe(60)
  })

  it('la confirmación del comprobante también queda asentada', async () => {
    const asientos = await asientosDe('Comprobante', claves.Comprobante)
    const cambios = asientos.filter((a) => a.operacion === 'MODIFICA')

    expect(cambios).toHaveLength(1)
    expect(cambios[0].anterior).toMatchObject({ estado: 'pendiente' })
    expect(cambios[0].posterior).toMatchObject({ estado: 'disponible' })
  })

  it('cerrar una vigencia deja su propio asiento (regla RN-02)', async () => {
    const asientos = await asientosDe('CoeficienteHistorico', claves.CoeficienteHistorico)
    const cambios = asientos.filter((a) => a.operacion === 'MODIFICA')

    expect(cambios).toHaveLength(1)
    expect(cambios[0].anterior).toMatchObject({ vigencia_hasta: null })
    expect(cambios[0].posterior?.vigencia_hasta).not.toBeNull()
  })

  it('una operación deja un asiento, no dos: la cuenta cierra', async () => {
    // Catorce escrituras contadas a mano sobre las cinco tablas: dos altas de
    // unidad y dos cambios; dos altas de historia con su cierre y dos
    // aperturas; un periodo; un gasto; un comprobante y su confirmacion.
    const [{ total }] = await prismaBase.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total FROM "BitacoraAuditoria"
      WHERE tabla = ANY(${TABLAS_ECONOMICAS}) AND clave = ANY(${deLaCorrida})
    `

    expect(Number(total)).toBe(14)
  })

  it('la aplicación no puede borrar lo que sus propias tablas asentaron (SC-008)', async () => {
    const clave = claves.Gasto

    await expect(
      prismaBase.$executeRaw`DELETE FROM "BitacoraAuditoria" WHERE clave = ${clave}`,
    ).rejects.toThrow(/permission denied/i)

    await expect(
      prismaBase.$executeRaw`UPDATE "BitacoraAuditoria" SET usuario = 'otro' WHERE clave = ${clave}`,
    ).rejects.toThrow(/permission denied/i)

    // Y el asiento sigue donde estaba.
    expect((await asientosDe('Gasto', clave)).length).toBeGreaterThan(0)
  })
})
