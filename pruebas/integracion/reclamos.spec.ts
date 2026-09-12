import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cargarPadron } from '@/aplicacion/consorcios/unidades'
import { registrarOcupacion } from '@/aplicacion/consorcios/registrar-ocupacion'
import { asignar } from '@/aplicacion/reclamos/asignar'
import { listarReclamos, verReclamo } from '@/aplicacion/reclamos/consultar'
import { registrarReclamo } from '@/aplicacion/reclamos/registrar'
import { transicionar } from '@/aplicacion/reclamos/transicionar'
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
 * Reclamos contra la base (`RF-11`, `RF-13`, `CU-07`, `CU-08`): un asiento por
 * transicion (SC-003), RN-11 impuesta por el CHECK (SC-004), aislamiento
 * (RN-12) y avisos en cada cambio (§ 12.7).
 */

const RELOJ = relojFijo('2026-09-15T12:00:00Z')
const repo = repositorioHabilitaciones

let consorcioId: string
let administrador: string
let vecino: { id: string; personaId: string }
let unidadId: string

beforeEach(async () => {
  const administradora = await crearAdministradora()
  consorcioId = (await crearConsorcio(administradora.id, 'Mitre 456')).id
  administrador = (await crearUsuario('Ada')).id
  await habilitarEnConsorcio(administrador, consorcioId, 'administrador')
  const usuario = await crearUsuario('Beto')
  vecino = { id: usuario.id, personaId: usuario.personaId }
  await habilitarEnConsorcio(vecino.id, consorcioId, 'consorcista')

  await cargarPadron(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidades: [
      { designacion: '1A', coeficiente: '50.00000000' },
      { designacion: '1B', coeficiente: '50.00000000' },
    ],
  })
  unidadId = (
    await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId, designacion: '1A' } })
  ).id
  await registrarOcupacion(repo, RELOJ, {
    usuarioId: administrador,
    consorcioId,
    unidadId,
    personaId: vecino.personaId,
    tipo: 'propietario',
    desde: new Date('2026-01-01'),
  })
})

afterEach(async () => {
  await prismaBase.$executeRaw`DELETE FROM "Notificacion"`
  await prismaBase.trabajoPendiente.deleteMany({})
  await prismaBase.$executeRaw`DELETE FROM "Ocupacion"`
  await prismaBase.$executeRaw`DELETE FROM "CoeficienteHistorico"`
  await limpiar()
})

const abrir = () =>
  registrarReclamo(repo, RELOJ, {
    usuarioId: vecino.id,
    consorcioId,
    unidadId,
    titulo: 'Filtración en la cocina',
    descripcion: 'Desde el domingo gotea agua del techo de la cocina.',
    urgencia: 'alta',
  })

describe('historial (SC-003)', () => {
  it('cada transicion deja exactamente un asiento, mas el de creacion', async () => {
    const { reclamoId } = await abrir()
    const paso = (hacia: Parameters<typeof transicionar>[2]['hacia'], comentario?: string) =>
      transicionar(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        reclamoId,
        hacia,
        comentario,
        responsableId: administrador,
      })

    await paso('asignado')
    await paso('en_curso', 'Fue el plomero')
    await paso('resuelto')
    await paso('cerrado')
    // La reapertura la hace el autor: es una de sus dos transiciones.
    await transicionar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      reclamoId,
      hacia: 'abierto',
      comentario: 'Volvió a gotear',
    })

    const detalle = await verReclamo(repo, RELOJ, { usuarioId: vecino.id, consorcioId, reclamoId })
    expect(detalle.historial.map((h) => h.estadoNuevo)).toEqual([
      'abierto',
      'asignado',
      'en_curso',
      'resuelto',
      'cerrado',
      'abierto',
    ])
    expect(detalle.historial[0].estadoAnterior).toBeNull()
    expect(detalle.historial[2].comentario).toBe('Fue el plomero')
    expect(detalle.estado).toBe('abierto')
    expect(detalle.responsable).toBeNull()
    expect(detalle.fechaResolucion).toBeNull()

    const asientos = await prismaBase.reclamoHistorial.count({ where: { reclamoId } })
    expect(asientos).toBe(6)
  })

  it('una reapertura resuelta de nuevo sobrescribe la fecha de resolucion: I-4 mide hasta el ultimo cierre', async () => {
    const { reclamoId } = await abrir()
    const paso = (hacia: Parameters<typeof transicionar>[2]['hacia'], reloj = RELOJ) =>
      transicionar(repo, reloj, {
        usuarioId: administrador,
        consorcioId,
        reclamoId,
        hacia,
        responsableId: administrador,
      })
    await paso('asignado')
    await paso('en_curso')
    await paso('resuelto')
    const primera = (await prismaBase.reclamo.findUniqueOrThrow({ where: { id: reclamoId } }))
      .fechaResolucion
    await paso('cerrado')
    await paso('abierto')
    await paso('asignado')
    await paso('en_curso')
    await paso('resuelto', relojFijo('2026-09-20T12:00:00Z'))
    const segunda = (await prismaBase.reclamo.findUniqueOrThrow({ where: { id: reclamoId } }))
      .fechaResolucion
    expect(segunda!.getTime()).toBeGreaterThan(primera!.getTime())
  })
})

describe('regla RN-11 (SC-004)', () => {
  it('la aplicacion rechaza asignar sin responsable con un mensaje legible', async () => {
    const { reclamoId } = await abrir()
    await expect(
      transicionar(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        reclamoId,
        hacia: 'asignado',
      }),
    ).rejects.toThrow('primero hay que asignarle un responsable')
  })

  it('un UPDATE directo que salte la aplicacion lo rechaza la base', async () => {
    const { reclamoId } = await abrir()
    await expect(
      prismaBase.reclamo.update({ where: { id: reclamoId }, data: { estado: 'asignado' } }),
    ).rejects.toThrow(/reclamo_responsable_fuera_de_abierto|check constraint/i)
  })

  it('no se saltan pasos', async () => {
    const { reclamoId } = await abrir()
    await expect(
      transicionar(repo, RELOJ, {
        usuarioId: administrador,
        consorcioId,
        reclamoId,
        hacia: 'cerrado',
        responsableId: administrador,
      }),
    ).rejects.toThrow('no puede pasar a cerrado')
  })
})

describe('quien ve y quien puede (RN-12, roles)', () => {
  it('otro consorcio responde «no encontrado» por identificador', async () => {
    const { reclamoId } = await abrir()
    const ajeno = await crearUsuario('Zoe')
    const otro = (await crearConsorcio((await crearAdministradora('Otra')).id, 'Otro 1')).id
    await habilitarEnConsorcio(ajeno.id, otro, 'administrador')

    await expect(
      verReclamo(repo, RELOJ, { usuarioId: ajeno.id, consorcioId: otro, reclamoId }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })

  it('el consorcista ve los propios y los generales; el administrador, todos', async () => {
    await abrir()
    const otroVecino = await crearUsuario('Caro')
    await habilitarEnConsorcio(otroVecino.id, consorcioId, 'consorcista')
    await registrarReclamo(repo, RELOJ, {
      usuarioId: otroVecino.id,
      consorcioId,
      titulo: 'Luz del palier',
      descripcion: 'La luz del palier del tercero está quemada.',
    })

    const delVecino = await listarReclamos(repo, RELOJ, { usuarioId: vecino.id, consorcioId })
    expect(delVecino.map((r) => r.titulo).sort()).toEqual([
      'Filtración en la cocina',
      'Luz del palier',
    ])
    const delOtro = await listarReclamos(repo, RELOJ, { usuarioId: otroVecino.id, consorcioId })
    expect(delOtro.map((r) => r.titulo)).toEqual(['Luz del palier'])
    const delAdmin = await listarReclamos(repo, RELOJ, { usuarioId: administrador, consorcioId })
    expect(delAdmin).toHaveLength(2)
  })

  it('el consorcista no reclama sobre una unidad que no ocupa', async () => {
    const otraUnidad = (
      await prismaBase.unidad.findFirstOrThrow({ where: { consorcioId, designacion: '1B' } })
    ).id
    await expect(
      registrarReclamo(repo, RELOJ, {
        usuarioId: vecino.id,
        consorcioId,
        unidadId: otraUnidad,
        titulo: 'Ruidos',
        descripcion: 'Ruidos molestos todas las noches.',
      }),
    ).rejects.toThrow('No encontramos lo que buscabas.')
  })

  it('el autor no puede asignar ni cerrar; si puede decir que no quedo resuelto', async () => {
    const { reclamoId } = await abrir()
    await expect(
      transicionar(repo, RELOJ, {
        usuarioId: vecino.id,
        consorcioId,
        reclamoId,
        hacia: 'asignado',
        responsableId: administrador,
      }),
    ).rejects.toThrow('Tu rol no permite')
    await asignar(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      reclamoId,
      responsableId: administrador,
    })
    await transicionar(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      reclamoId,
      hacia: 'en_curso',
    })
    await transicionar(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      reclamoId,
      hacia: 'resuelto',
    })
    await transicionar(repo, RELOJ, {
      usuarioId: vecino.id,
      consorcioId,
      reclamoId,
      hacia: 'en_curso',
    })
    const detalle = await verReclamo(repo, RELOJ, { usuarioId: vecino.id, consorcioId, reclamoId })
    expect(detalle.estado).toBe('en_curso')
  })
})

describe('avisos y triage', () => {
  it('cada transicion avisa al autor (y al responsable si no es quien la hizo), y el alta encola el triage', async () => {
    const { reclamoId } = await abrir()
    const triage = await prismaBase.trabajoPendiente.findMany({ where: { tipo: 'triage_reclamo' } })
    expect(triage).toHaveLength(1)

    await asignar(repo, RELOJ, {
      usuarioId: administrador,
      consorcioId,
      reclamoId,
      responsableId: administrador,
    })
    const avisos = await prismaBase.notificacion.findMany({
      where: { tipo: 'cambio_estado_reclamo' },
    })
    expect(avisos.map((a) => a.usuarioId)).toEqual([vecino.id])
    expect(avisos[0].titulo).toContain('asignado')
    const trabajos = await prismaBase.trabajoPendiente.count({ where: { tipo: 'notificacion' } })
    expect(trabajos).toBe(1)
  })
})
