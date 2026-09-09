import { ErrorDeAplicacion } from '@/compartido/errores'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacionDePlataforma } from '@/aplicacion/autorizacion'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Alta de administradora (FR-007b): la empresa que administra una cartera de
 * consorcios, segundo eje del aislamiento. El punto 9 la compromete en el
 * factor 13 y el punto 7 no la tenia hasta esta etapa.
 *
 * Solo el super administrador de plataforma: el producto es multiempresa
 * (§ 6.2), asi que dar de alta una administradora es una operacion de la
 * plataforma y no del negocio de ninguna empresa.
 */

export class CuitDeAdministradoraRepetido extends ErrorDeAplicacion {
  constructor() {
    super('Ya hay una administradora con ese CUIT.', 'RF-01')
  }
}

export async function altaAdministradora(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; razonSocial: string; cuit: string },
): Promise<{ administradoraId: string }> {
  return conAutorizacionDePlataforma(
    repositorio,
    reloj,
    { usuarioId: datos.usuarioId, accion: 'dar de alta una administradora' },
    async () => {
      if (await prismaBase.administradora.findUnique({ where: { cuit: datos.cuit } })) {
        throw new CuitDeAdministradoraRepetido()
      }

      const creada = await prismaBase.administradora.create({
        data: { razonSocial: datos.razonSocial, cuit: datos.cuit },
      })

      return { administradoraId: creada.id }
    },
  )
}
