import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'
import { plantillaOcupantes, plantillaPadron } from '@/infraestructura/planillas/plantillas'

/**
 * Plantilla descargable (RF-02, RF-03). La de ocupantes lleva las designaciones
 * vigentes del consorcio —dato del consorcio—, así que se autoriza igual que la
 * página: solo el administrador.
 */
export async function plantillaPara(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; tipo: 'padron' | 'ocupantes' },
): Promise<{ nombre: string; bytes: Uint8Array }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'descargar plantilla de importación',
    },
    async () => {
      const nombre = `${datos.tipo}-${datos.consorcioId}.xlsx`
      if (datos.tipo === 'padron') return { nombre, bytes: await plantillaPadron() }
      // Aislada por la extensión; las bajas no se ofrecen (nota 23).
      const unidades = await prisma.unidad.findMany({
        where: { bajaDesde: null },
        select: { designacion: true },
        orderBy: { designacion: 'asc' },
      })
      return { nombre, bytes: await plantillaOcupantes(unidades.map((u) => u.designacion)) }
    },
  )
}
