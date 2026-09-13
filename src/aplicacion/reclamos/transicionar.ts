import { NoEncontrado, RolInsuficiente } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import {
  ETIQUETAS_ESTADO,
  type EstadoReclamo,
  exigirTransicion,
  ReclamoSinResponsable,
  requiereResponsable,
} from '@/dominio/reclamos/estado'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { notificar, type Transaccion } from '@/aplicacion/comunicacion/notificar'
import { prisma } from '@/infraestructura/prisma'

/**
 * El **unico** camino que cambia el estado de un reclamo (`RF-13`, `CU-08`,
 * `FR-006`, `FR-007`, research R-09). Valida con el dominio, exige responsable
 * fuera de `abierto` —y la base lo vuelve a exigir con su CHECK—, escribe el
 * estado y el asiento en una transaccion, y avisa al autor y al responsable
 * (§ 12.7). Cero transiciones sin asiento (SC-003).
 *
 * Quien puede: el administrador, cualquier transicion; el autor, solo decir que
 * no quedo resuelto (`resuelto → en_curso`) o reabrir (`cerrado → abierto`).
 */

const TRANSICIONES_DEL_AUTOR: readonly [EstadoReclamo, EstadoReclamo][] = [
  ['resuelto', 'en_curso'],
  ['cerrado', 'abierto'],
]

export async function transicionar(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    consorcioId: string
    reclamoId: string
    hacia: EstadoReclamo
    comentario?: string | null
    /** Al asignar: el responsable que se fija en la misma transaccion. */
    responsableId?: string | null
  },
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, consorcioId: datos.consorcioId, accion: 'cambiar el reclamo' },
    async (acceso) => {
      const reclamo = await prisma.reclamo.findFirst({ where: { id: datos.reclamoId } })
      if (!reclamo) throw new NoEncontrado()

      const esAdministrador = acceso.roles.includes('administrador')
      const esAutor = reclamo.creadoPor === datos.usuarioId
      const permitidaAlAutor = TRANSICIONES_DEL_AUTOR.some(
        ([desde, hacia]) => desde === reclamo.estado && hacia === datos.hacia,
      )
      if (!esAdministrador && !(esAutor && permitidaAlAutor)) {
        throw new RolInsuficiente(`pasar el reclamo a ${ETIQUETAS_ESTADO[datos.hacia]}`)
      }

      exigirTransicion(reclamo.estado, datos.hacia)

      // Volver a abierto (reapertura o quitar responsable) deja el reclamo sin
      // responsable, que es lo unico que ese estado admite.
      const responsableId =
        datos.hacia === 'abierto' ? null : (datos.responsableId ?? reclamo.responsableId)
      if (requiereResponsable(datos.hacia) && !responsableId) {
        throw new ReclamoSinResponsable(datos.hacia)
      }

      await prisma.$transaction(async (tx) => {
        await tx.reclamo.update({
          where: { id: reclamo.id },
          data: {
            estado: datos.hacia,
            responsableId,
            // Se sobrescribe en cada resolucion: I-4 mide hasta el ultimo cierre.
            ...(datos.hacia === 'resuelto' ? { fechaResolucion: reloj.ahora() } : {}),
            ...(datos.hacia === 'abierto' ? { fechaResolucion: null } : {}),
          },
        })
        await tx.reclamoHistorial.create({
          data: {
            reclamoId: reclamo.id,
            estadoAnterior: reclamo.estado,
            estadoNuevo: datos.hacia,
            comentario: datos.comentario?.trim() || null,
            usuarioId: datos.usuarioId,
          },
        })
        await avisar(tx, reclamo, datos.hacia, responsableId, datos.usuarioId)
      })
    },
  )
}

async function avisar(
  tx: Transaccion,
  reclamo: { id: string; titulo: string; creadoPor: string },
  hacia: EstadoReclamo,
  responsableId: string | null,
  autorDelCambio: string,
): Promise<void> {
  const destinatarios = new Set([reclamo.creadoPor, responsableId].filter(Boolean) as string[])
  destinatarios.delete(autorDelCambio)
  await notificar(
    tx,
    [...destinatarios].map((usuarioId) => ({
      usuarioId,
      tipo: 'cambio_estado_reclamo' as const,
      titulo: `Reclamo «${reclamo.titulo}»: ${ETIQUETAS_ESTADO[hacia].toLowerCase()}`,
      cuerpo: `El reclamo «${reclamo.titulo}» pasó a ${ETIQUETAS_ESTADO[hacia].toLowerCase()}.`,
      entidadTipo: 'Reclamo',
      entidadId: reclamo.id,
    })),
  )
}
