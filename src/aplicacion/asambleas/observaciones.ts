import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { sinConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma } from '@/infraestructura/prisma'

import { cargarAsamblea } from './comun'
import { representables } from './conducir'
import { AsambleaInvalida, conReglas, NoPresente } from './errores'

const MAXIMO = 1000

/**
 * La observación de cada presente (RF-32), una por persona y corregible hasta
 * finalizar. Cuándo se puede escribir lo sostiene el disparador. Se mira quién
 * puede representar la unidad y no `representanteId`: esa columna queda nula
 * para el apoderado que acreditó quien dirige.
 */
export async function guardarObservacion(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; asambleaId: string; texto: string },
): Promise<void> {
  await conAutorizacion(
    repositorio,
    reloj,
    { ...datos, accion: 'observar en asambleas' },
    async () => {
      const asamblea = await cargarAsamblea(datos.asambleaId)
      const texto = datos.texto.trim()
      if (texto.length > MAXIMO) {
        throw new AsambleaInvalida('La observación admite hasta 1.000 caracteres.')
      }

      const mias = new Set(
        (await representables(asamblea.id, datos.usuarioId, reloj.hoy())).map((u) => u.unidadId),
      )
      const presentes = await prisma.unidadEnAsamblea.findMany({
        where: { asambleaId: asamblea.id, presente: true },
        select: { unidadId: true, designacion: true },
        orderBy: { designacion: 'asc' },
      })
      const propias = presentes.filter((u) => mias.has(u.unidadId))
      if (propias.length === 0 && asamblea.dirigeId !== datos.usuarioId) throw new NoPresente()

      const unidades = propias.map((u) => u.designacion).join(', ')
      await conReglas(() =>
        prisma.observacionAsamblea.upsert({
          where: {
            asambleaId_usuarioId: { asambleaId: asamblea.id, usuarioId: datos.usuarioId },
          },
          create: sinConsorcio({
            asambleaId: asamblea.id,
            usuarioId: datos.usuarioId,
            unidades,
            texto,
          }),
          update: { unidades, texto },
        }),
      )
    },
  )
}
