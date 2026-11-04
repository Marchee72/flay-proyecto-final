import type { SentidoVoto } from '@prisma/client'

import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'
import { propietariosVigentesDe } from '@/infraestructura/repositorios/ocupaciones'

import { cargarAsamblea, exigirDirige, ROLES_ORGANIZADORES } from './comun'
import { AsambleaInvalida, conReglas, NoRepresenta, UnidadYaVoto } from './errores'

/**
 * El voto (FR-021, FR-022). Un voto por unidad y por punto (clave única):
 * mientras el punto está abierto se puede cambiar (`upsert`); una vez cerrado
 * el punto, la base impide cualquier modificación o baja (`fn_voto_inmutable`).
 */

export type Eleccion = { sentido: SentidoVoto } | { opcionId: string }

type Datos = {
  usuarioId: string
  consorcioId: string
  asambleaId: string
  puntoId: string
  unidadId: string
  eleccion: Eleccion
}

async function insertarVoto(
  datos: Datos,
  origen: 'propio' | 'carga_manual',
  ahora: Date,
): Promise<void> {
  const punto = await prisma.puntoAsamblea.findFirst({
    where: { id: datos.puntoId, asambleaId: datos.asambleaId },
    select: { id: true },
  })
  if (!punto) throw new AsambleaInvalida('Ese punto no es de esta asamblea.')
  const sentido = 'sentido' in datos.eleccion ? datos.eleccion.sentido : null
  const opcionId = 'opcionId' in datos.eleccion ? datos.eleccion.opcionId : null
  await conReglas(
    () =>
      prisma.votoAsamblea.upsert({
        where: {
          puntoId_unidadId: {
            puntoId: datos.puntoId,
            unidadId: datos.unidadId,
          },
        },
        create: sinConsorcio({
          puntoId: datos.puntoId,
          unidadId: datos.unidadId,
          sentido,
          opcionId,
          emitidoPorId: datos.usuarioId,
          origen,
          emitidoEn: ahora,
        }),
        update: {
          sentido,
          opcionId,
          emitidoPorId: datos.usuarioId,
          origen,
          emitidoEn: ahora,
        },
      }),
    () => new UnidadYaVoto(),
  )
}

/** Quien representa la unidad vota desde su teléfono. */
export async function votar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  await conAutorizacion(repositorio, reloj, { ...datos, accion: 'votar' }, async () => {
    const asamblea = await cargarAsamblea(datos.asambleaId)
    const unidad = await prisma.unidadEnAsamblea.findFirst({
      where: { asambleaId: asamblea.id, unidadId: datos.unidadId },
      select: { representanteId: true, presente: true, representacion: true },
    })
    let representanteId = unidad?.representanteId ?? null
    if (unidad?.presente && !representanteId && unidad.representacion === 'propietario') {
      const titulares = await propietariosVigentesDe([datos.unidadId], reloj.hoy())
      if (titulares.some((t) => t.usuarioId === datos.usuarioId)) {
        representanteId = datos.usuarioId
      }
    }
    if (!unidad?.presente || representanteId !== datos.usuarioId) throw new NoRepresenta()
    await insertarVoto(datos, 'propio', reloj.ahora())
  })
}

/**
 * Quien dirige carga el voto de una unidad presente que no puede votar sola.
 * Nunca pisa el que la unidad emitió por sí misma (FR-022).
 */
export async function cargarVoto(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: Datos,
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, rolesPermitidos: ROLES_ORGANIZADORES, accion: 'dirigir asambleas' },
    async (acceso) => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      exigirDirige(acceso, asamblea)
      const previo = await prisma.votoAsamblea.findFirst({
        where: { puntoId: datos.puntoId, unidadId: datos.unidadId },
        select: { origen: true },
      })
      if (previo?.origen === 'propio') throw new UnidadYaVoto()
      await insertarVoto(datos, 'carga_manual', reloj.ahora())
    },
  )
}
