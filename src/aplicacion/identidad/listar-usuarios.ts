import type { EstadoTrabajo, EstadoUsuario } from '@prisma/client'

import { conAutorizacion } from '@/aplicacion/autorizacion'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import type { Rol } from '@/dominio/identidad/rol'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Quienes tienen acceso a un consorcio (FR-007). Es de administrador: la nomina
 * de personas es dato personal (RNF-13) y no la ve un consorcista.
 *
 * El filtro por consorcio **no se escribe**: `Habilitacion` declara
 * `consorcio_id`, asi que lo pone la extension de aislamiento (Principio I).
 */

export type InvitacionPendiente = {
  trabajoId: string
  estado: EstadoTrabajo
  intentos: number
  ultimoError: string | null
}

export type UsuarioDelConsorcio = {
  usuarioId: string
  nombre: string
  correo: string
  roles: Rol[]
  estado: EstadoUsuario
  bloqueado: boolean
  invitacion: InvitacionPendiente | null
}

export async function listarUsuarios(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<UsuarioDelConsorcio[]> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'ver los usuarios del consorcio',
    },
    async () => {
      const habilitaciones = await prisma.habilitacion.findMany({
        where: { OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: reloj.hoy() } }] },
        include: { usuario: { include: { persona: true } } },
        orderBy: { creadoEn: 'asc' },
      })

      const ahora = reloj.ahora()
      const porUsuario = new Map<string, UsuarioDelConsorcio>()

      for (const habilitacion of habilitaciones) {
        const { usuario } = habilitacion
        const ya = porUsuario.get(usuario.id)

        if (ya) {
          // El consejo se suma a consorcista: una fila por persona, N roles.
          ya.roles.push(habilitacion.rol)
          continue
        }

        porUsuario.set(usuario.id, {
          usuarioId: usuario.id,
          nombre: `${usuario.persona.apellido}, ${usuario.persona.nombre}`,
          correo: usuario.correo,
          roles: [habilitacion.rol],
          estado: usuario.estado,
          bloqueado: !!usuario.bloqueadoHasta && usuario.bloqueadoHasta > ahora,
          invitacion: null,
        })
      }

      const filas = [...porUsuario.values()]
      await ponerElEstadoDeLaInvitacion(filas)

      return filas
    },
  )
}

/**
 * Estado del correo de invitacion, a la vista (FR-006b): sin esto, una
 * invitacion que nunca salio se ve igual que una que el invitado no abrio.
 *
 * ponytail: la carga es JSONB y se cruza en memoria por correo; con volumen
 * pasar a una columna indexada en TrabajoPendiente.
 */
async function ponerElEstadoDeLaInvitacion(filas: UsuarioDelConsorcio[]): Promise<void> {
  const invitados = filas.filter((fila) => fila.estado === 'invitado')

  if (invitados.length === 0) return

  const trabajos = await prismaBase.trabajoPendiente.findMany({
    // Tambien los ya despachados: un correo que salio pero se perdio es
    // exactamente el caso en el que el administrador necesita reenviar.
    where: { tipo: 'invitacion' },
    orderBy: { creadoEn: 'desc' },
  })

  for (const fila of invitados) {
    const suyo = trabajos.find(
      (trabajo) => (trabajo.carga as { destino?: string })?.destino === fila.correo,
    )

    if (!suyo) continue

    fila.invitacion = {
      trabajoId: suyo.id,
      estado: suyo.estado,
      intentos: suyo.intentos,
      ultimoError: suyo.ultimoError,
    }
  }
}
