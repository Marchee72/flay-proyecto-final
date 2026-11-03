import type { ReglaMayoria } from '@prisma/client'
import { z } from 'zod'

import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'

import { ConfiguracionInvalida } from './errores'

/**
 * Reglas de asamblea del consorcio (FR-035, research R-13). Rigen para las
 * próximas convocatorias: cada asamblea copia las suyas al convocarse. Los
 * rangos los repite un CHECK de la base, y la bitácora la pone el disparador
 * `auditar_consorcio` (RN-15).
 */

export interface ConfiguracionAsambleas {
  reglaMayoria: ReglaMayoria
  anticipacionDias: number
  topeApoderado: number
  umbralSinVoto: number
}

const ESQUEMA = z.object({
  reglaMayoria: z.enum(['presentes', 'totalidad']),
  anticipacionDias: z
    .number({ message: 'Indicá los días de anticipación.' })
    .int()
    .min(1, 'La anticipación va de 1 a 60 días.')
    .max(60, 'La anticipación va de 1 a 60 días.'),
  topeApoderado: z
    .number({ message: 'Indicá el tope de unidades por apoderado.' })
    .int()
    .min(1, 'Un apoderado puede representar de 1 a 10 unidades.')
    .max(10, 'Un apoderado puede representar de 1 a 10 unidades.'),
  umbralSinVoto: z
    .number({ message: 'Indicá desde cuántas expensas adeudadas se pierde el voto.' })
    .int()
    .min(0, 'El umbral de mora va de 0 a 24 expensas.')
    .max(24, 'El umbral de mora va de 0 a 24 expensas.'),
})

export async function verConfiguracion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<ConfiguracionAsambleas> {
  return conAutorizacion(
    repositorio,
    reloj,
    { ...datos, rolesPermitidos: ['administrador'], accion: 'configurar las asambleas' },
    async () => {
      const c = await prisma.consorcio.findUniqueOrThrow({
        where: { id: datos.consorcioId },
        select: {
          reglaMayoriaAsamblea: true,
          anticipacionConvocatoriaDias: true,
          topeUnidadesPorApoderado: true,
          umbralExpensasSinVoto: true,
        },
      })
      return {
        reglaMayoria: c.reglaMayoriaAsamblea,
        anticipacionDias: c.anticipacionConvocatoriaDias,
        topeApoderado: c.topeUnidadesPorApoderado,
        umbralSinVoto: c.umbralExpensasSinVoto,
      }
    },
  )
}

export async function guardarConfiguracion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: ConfiguracionAsambleas & { usuarioId: string; consorcioId: string },
): Promise<void> {
  const validos = ESQUEMA.safeParse(datos)
  if (!validos.success) throw new ConfiguracionInvalida(validos.error.issues[0].message)
  await conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'configurar las asambleas',
    },
    async () => {
      await prisma.consorcio.update({
        where: { id: datos.consorcioId },
        data: {
          reglaMayoriaAsamblea: validos.data.reglaMayoria,
          anticipacionConvocatoriaDias: validos.data.anticipacionDias,
          topeUnidadesPorApoderado: validos.data.topeApoderado,
          umbralExpensasSinVoto: validos.data.umbralSinVoto,
        },
      })
    },
  )
}
