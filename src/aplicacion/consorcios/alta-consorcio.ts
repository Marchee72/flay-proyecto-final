import { ErrorDeAplicacion } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacionDePlataforma } from '@/aplicacion/autorizacion'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Alta de consorcio (FR-009, FR-007b).
 *
 * La autoriza el super administrador de plataforma, no un administrador de
 * consorcio: al crear el primero no hay consorcio contra el cual evaluar el par
 * (rol, consorcio). Es una de las dos operaciones que trabajan por encima del
 * aislamiento, y por eso no abre contexto.
 *
 * Quien lo crea queda habilitado sobre el como administrador en la misma
 * transaccion: un consorcio sin nadie que lo administre no le sirve a nadie.
 */

export class CuitYaRegistrado extends ErrorDeAplicacion {
  constructor() {
    super('Ya hay un consorcio con ese CUIT.', 'RF-01')
  }
}

export async function altaConsorcio(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: {
    usuarioId: string
    administradoraId: string
    nombre: string
    direccion: string
    localidad: string
    cuit: string
  },
): Promise<{ consorcioId: string }> {
  return conAutorizacionDePlataforma(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, accion: 'dar de alta un consorcio' },
    async () => {
      if (await prismaBase.consorcio.findUnique({ where: { cuit: datos.cuit } })) {
        throw new CuitYaRegistrado()
      }

      const consorcio = await prismaBase.$transaction(async (tx) => {
        const creado = await tx.consorcio.create({
          data: {
            administradoraId: datos.administradoraId,
            nombre: datos.nombre,
            direccion: datos.direccion,
            localidad: datos.localidad,
            cuit: datos.cuit,
          },
        })

        await tx.habilitacion.create({
          data: {
            usuarioId: datos.usuarioId,
            consorcioId: creado.id,
            rol: 'administrador',
            vigenciaDesde: reloj.hoy(),
          },
        })

        return creado
      })

      return { consorcioId: consorcio.id }
    },
  )
}
