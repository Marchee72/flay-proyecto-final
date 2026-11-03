import type { SentidoVoto } from '@prisma/client'

import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

import { cargarAsamblea, exigirDirige, ROLES_ORGANIZADORES } from './comun'
import { AsambleaInvalida, conReglas, NoRepresenta, UnidadYaVoto } from './errores'

/**
 * El voto (FR-021, FR-022). Un solo INSERT: la base garantiza un voto por
 * unidad y por punto (clave única) y que no se modifica ni se emite fuera de
 * un punto abierto (`fn_voto_inmutable`). Acá solo se decide quién puede.
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

async function insertarVoto(datos: Datos, origen: 'propio' | 'carga_manual'): Promise<void> {
  const punto = await prisma.puntoAsamblea.findFirst({
    where: { id: datos.puntoId, asambleaId: datos.asambleaId },
    select: { id: true },
  })
  if (!punto) throw new AsambleaInvalida('Ese punto no es de esta asamblea.')
  await conReglas(
    () =>
      prisma.votoAsamblea.create({
        data: sinConsorcio({
          puntoId: datos.puntoId,
          unidadId: datos.unidadId,
          sentido: 'sentido' in datos.eleccion ? datos.eleccion.sentido : null,
          opcionId: 'opcionId' in datos.eleccion ? datos.eleccion.opcionId : null,
          emitidoPorId: datos.usuarioId,
          origen,
        }),
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
      select: { representanteId: true, presente: true },
    })
    if (!unidad?.presente || unidad.representanteId !== datos.usuarioId) throw new NoRepresenta()
    await insertarVoto(datos, 'propio')
  })
}

/** Quien dirige carga el voto de una unidad presente que no puede votar sola. */
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
      await insertarVoto(datos, 'carga_manual')
    },
  )
}
