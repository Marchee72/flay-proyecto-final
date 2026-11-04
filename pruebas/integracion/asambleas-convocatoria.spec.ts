import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  borrarBorrador,
  cancelar,
  convocar,
  crearAsamblea,
  editarBorrador,
} from '@/aplicacion/asambleas/convocar'
import { AnticipacionInsuficiente, AsambleaInvalida } from '@/aplicacion/asambleas/errores'
import { listarAsambleas, verAsamblea } from '@/aplicacion/asambleas/ver'
import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import { prismaBase } from '@/infraestructura/prisma'

import {
  armarEscenario,
  asambleaConvocada,
  FECHA_REUNION,
  HOY,
  PUNTOS,
  repo,
  type Escenario,
} from './asambleas-ayudas'
import { limpiar } from './ayudas'

/**
 * Convocatoria contra la base (US1, FR-001 a FR-009, SC-003, SC-004, SC-005).
 */

let e: Escenario

beforeEach(async () => {
  e = await armarEscenario()
})

afterEach(async () => {
  await limpiar()
})

const datos = (fechaHora = FECHA_REUNION) => ({
  tipo: 'ordinaria' as const,
  titulo: 'Asamblea ordinaria 2026',
  fechaHora,
  lugar: 'SUM',
  administracionInvitada: true,
  puntos: PUNTOS,
})

describe('crear', () => {
  it('rechaza opciones repetidas y textos más largos que la columna', async () => {
    const con = (cambio: object) => ({
      ...datos(),
      ...cambio,
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
    })
    await expect(
      crearAsamblea(
        repo,
        HOY,
        con({
          puntos: [
            { titulo: 'Pintura', modalidad: 'opcion_multiple', opciones: ['Azul', ' azul'] },
          ],
        }),
      ),
    ).rejects.toThrow(/opciones repetidas/)
    await expect(crearAsamblea(repo, HOY, con({ titulo: 'x'.repeat(201) }))).rejects.toThrow(
      /hasta 200 caracteres/,
    )
  })

  it('un consorcista no ve los borradores; quien organiza, sí', async () => {
    const { asambleaId } = await crearAsamblea(repo, HOY, {
      ...datos(),
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
    })
    const consorcista = { usuarioId: e.ana, consorcioId: e.consorcioId }
    await expect(verAsamblea(repo, HOY, { ...consorcista, asambleaId })).rejects.toBeInstanceOf(
      NoEncontrado,
    )
    expect((await listarAsambleas(repo, HOY, consorcista)).asambleas).toEqual([])
    const organizador = { usuarioId: e.consejo, consorcioId: e.consorcioId }
    expect((await listarAsambleas(repo, HOY, organizador)).asambleas).toHaveLength(1)
  })

  it('el consejo crea una asamblea en borrador con su orden del día', async () => {
    const { asambleaId } = await crearAsamblea(repo, HOY, {
      ...datos(),
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
    })
    const vista = await verAsamblea(repo, HOY, {
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
      asambleaId,
    })
    expect(vista.estado).toBe('borrador')
    expect(vista.puntos.map((p) => p.titulo)).toEqual([
      'Pintura del frente',
      'Presupuesto de ascensores',
    ])
    expect(vista.puntos[1].opciones.map((o) => o.texto)).toEqual([
      'Empresa X',
      'Empresa Y',
      'Empresa Z',
    ])
  })

  it('un consorcista sin consejo no puede crear', async () => {
    await expect(
      crearAsamblea(repo, HOY, { ...datos(), usuarioId: e.ana, consorcioId: e.consorcioId }),
    ).rejects.toBeInstanceOf(RolInsuficiente)
  })

  it('rechaza un punto de opciones con menos de dos', async () => {
    await expect(
      crearAsamblea(repo, HOY, {
        ...datos(),
        puntos: [{ titulo: 'Elegir', modalidad: 'opcion_multiple', opciones: ['Sola'] }],
        usuarioId: e.consejo,
        consorcioId: e.consorcioId,
      }),
    ).rejects.toBeInstanceOf(AsambleaInvalida)
  })

  it('si organiza la administración, queda invitada siempre', async () => {
    const { asambleaId } = await crearAsamblea(repo, HOY, {
      ...datos(),
      administracionInvitada: false,
      usuarioId: e.administracion,
      consorcioId: e.consorcioId,
    })
    const fila = await prismaBase.asamblea.findUniqueOrThrow({ where: { id: asambleaId } })
    expect(fila.administracionInvitada).toBe(true)
  })

  it('el borrador se edita y se borra', async () => {
    const { asambleaId } = await crearAsamblea(repo, HOY, {
      ...datos(),
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
    })
    await editarBorrador(repo, HOY, {
      ...datos(),
      titulo: 'Extraordinaria',
      puntos: [{ titulo: 'Único', modalidad: 'binaria', mayoria: 'dos_tercios' }],
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
      asambleaId,
    })
    expect(await prismaBase.puntoAsamblea.count({ where: { asambleaId } })).toBe(1)
    await borrarBorrador(repo, HOY, {
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
      asambleaId,
    })
    expect(await prismaBase.asamblea.count({ where: { id: asambleaId } })).toBe(0)
  })
})

describe('convocar', () => {
  it('rechaza una fecha anterior a la anticipación, con la fecha mínima', async () => {
    const { asambleaId } = await crearAsamblea(repo, HOY, {
      ...datos(new Date('2026-11-10T22:00:00Z')),
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
    })
    const intento = convocar(repo, HOY, {
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
      asambleaId,
    })
    await expect(intento).rejects.toBeInstanceOf(AnticipacionInsuficiente)
    await expect(intento).rejects.toMatchObject({
      mensajeParaUsuario: expect.stringContaining('18/11/2026'),
    })
  })

  it('avisa por los dos canales, copia las reglas y lista a quien no tiene contacto', async () => {
    const sinNada = await prismaBase.persona.create({ data: { nombre: 'Elio', apellido: 'Sin' } })
    await prismaBase.$executeRaw`
      INSERT INTO "Ocupacion" (unidad_id, persona_id, tipo, vigencia, actualizado_en)
      VALUES (${e.unidades['2B']}::uuid, ${sinNada.id}::uuid, 'propietario', daterange('2026-01-01', NULL, '[)'), now())`

    const { asambleaId } = await crearAsamblea(repo, HOY, {
      ...datos(),
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
    })
    const resultado = await convocar(repo, HOY, {
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
      asambleaId,
    })
    expect(resultado.sinContacto).toEqual([{ unidad: '2B', nombre: 'Elio Sin' }])

    const avisos = await prismaBase.notificacion.findMany({
      where: { tipo: 'asamblea_convocada', entidadId: asambleaId },
    })
    expect(new Set(avisos.map((a) => a.usuarioId))).toEqual(
      new Set([e.ana, e.bruno, e.carla, e.administracion]),
    )
    expect(avisos[0].cuerpo).toContain('calendar.google.com')
    expect(avisos[0].cuerpo).toContain('1. Pintura del frente')

    const correos = await prismaBase.trabajoPendiente.findMany({
      where: { tipo: 'correo_directo' },
    })
    expect(correos).toHaveLength(1)
    expect((correos[0].carga as { destino: string }).destino).toMatch(/^dora-/)

    const fila = await prismaBase.asamblea.findUniqueOrThrow({ where: { id: asambleaId } })
    expect(fila).toMatchObject({
      estado: 'convocada',
      reglaMayoria: 'presentes',
      anticipacionDias: 15,
      topeApoderado: 3,
      umbralSinVoto: 2,
    })
  })

  it('la administración no invitada no recibe aviso, pero ve la asamblea', async () => {
    const asambleaId = await asambleaConvocada(e, { administracionInvitada: false })
    expect(
      await prismaBase.notificacion.count({
        where: { usuarioId: e.administracion, entidadId: asambleaId },
      }),
    ).toBe(0)
    const vista = await verAsamblea(repo, HOY, {
      usuarioId: e.administracion,
      consorcioId: e.consorcioId,
      asambleaId,
    })
    expect(vista.estado).toBe('convocada')
    expect(vista.yo.puedeDirigir).toBe(false)
  })

  it('convocada, el orden del día no cambia: ni por la aplicación ni por SQL directo', async () => {
    const asambleaId = await asambleaConvocada(e)
    await expect(
      editarBorrador(repo, HOY, {
        ...datos(),
        usuarioId: e.consejo,
        consorcioId: e.consorcioId,
        asambleaId,
      }),
    ).rejects.toBeInstanceOf(AsambleaInvalida)
    await expect(
      prismaBase.$executeRaw`UPDATE "PuntoAsamblea" SET titulo = 'Otro' WHERE asamblea_id = ${asambleaId}::uuid`,
    ).rejects.toThrow(/orden del día/)
    await expect(
      prismaBase.$executeRaw`UPDATE "Asamblea" SET lugar = 'Otro' WHERE id = ${asambleaId}::uuid`,
    ).rejects.toThrow(/no cambia sus datos/)
  })

  it('cancelar avisa a todos', async () => {
    const asambleaId = await asambleaConvocada(e)
    await cancelar(repo, HOY, {
      usuarioId: e.consejo,
      consorcioId: e.consorcioId,
      asambleaId,
      motivo: 'Lluvia',
    })
    expect(
      await prismaBase.notificacion.count({
        where: { tipo: 'asamblea_cancelada', entidadId: asambleaId },
      }),
    ).toBe(4)
    const fila = await prismaBase.asamblea.findUniqueOrThrow({ where: { id: asambleaId } })
    expect(fila.estado).toBe('cancelada')
  })
})

describe('aislamiento (SC-005)', () => {
  it('un usuario de otro consorcio no ve la asamblea ni la lista', async () => {
    const asambleaId = await asambleaConvocada(e)
    await expect(
      verAsamblea(repo, HOY, {
        usuarioId: e.ajeno.administrador,
        consorcioId: e.consorcioId,
        asambleaId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    await expect(
      verAsamblea(repo, HOY, {
        usuarioId: e.ajeno.administrador,
        consorcioId: e.ajeno.consorcioId,
        asambleaId,
      }),
    ).rejects.toBeInstanceOf(NoEncontrado)
    const ajena = await listarAsambleas(repo, HOY, {
      usuarioId: e.ajeno.administrador,
      consorcioId: e.ajeno.consorcioId,
    })
    expect(ajena.asambleas).toHaveLength(0)
  })
})
