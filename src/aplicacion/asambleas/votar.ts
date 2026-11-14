import type { SentidoVoto } from '@prisma/client'

import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

import { cargarAsamblea, exigirDirige, ROLES_ORGANIZADORES } from './comun'
import { AsambleaInvalida, conReglas, NoRepresenta, ReglaDeAsamblea, UnidadYaVoto } from './errores'

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
  try {
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
  } catch (error) {
    // El disparador impide que la carga manual pise un voto propio: se dice con el error de siempre.
    if (error instanceof ReglaDeAsamblea && error.message === new UnidadYaVoto().message)
      throw new UnidadYaVoto()
    throw error
  }
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
      select: { representanteId: true, presente: true },
    })
    if (!unidad?.presente || unidad.representanteId !== datos.usuarioId) throw new NoRepresenta()
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
      await insertarVoto(datos, 'carga_manual', reloj.ahora())
    },
  )
}
