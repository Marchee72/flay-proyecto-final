import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import { prisma } from '@/infraestructura/prisma'
import { compararDesignaciones } from '@/dominio/unidades/division'
import {
  propietariosParaPlanilla,
  type PropietarioParaPlanilla,
} from '@/infraestructura/repositorios/ocupaciones'
import {
  padronActual,
  plantillaOcupantes,
  plantillaPadron,
} from '@/infraestructura/planillas/plantillas'

/** Descarga del padrón vigente en Excel: solo el administrador, igual que las plantillas. */
export async function padronEnExcel(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string },
): Promise<{ nombre: string; bytes: Uint8Array }> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'descargar el padrón',
    },
    async () => {
      // Aisladas por la extensión; las bajas no se ofrecen (nota 23).
      const unidades = await prisma.unidad.findMany({
        where: { bajaDesde: null },
        select: { id: true, designacion: true, tipo: true, coeficiente: true },
      })
      unidades.sort((a, b) => compararDesignaciones(a.designacion, b.designacion))
      // Los ids vienen de la consulta aislada de arriba.
      const duenos = await propietariosParaPlanilla(
        unidades.map((u) => u.id),
        reloj.hoy(),
      )
      const filas = unidades.flatMap((u) => {
        const base = {
          designacion: u.designacion,
          tipo: u.tipo,
          coeficiente: u.coeficiente.toFixed(8),
        }
        const suyos: (PropietarioParaPlanilla | null)[] = duenos.filter((d) => d.unidadId === u.id)
        if (suyos.length === 0) suyos.push(null)
        return suyos.map((dueno) => ({ ...base, dueno }))
      })
      return { nombre: `padron-${datos.consorcioId}.xlsx`, bytes: await padronActual(filas) }
    },
  )
}

/** La plantilla del padrón no depende del consorcio: sirve también antes de crearlo (alta). */
export async function plantillaDePadronParaAlta(): Promise<{ nombre: string; bytes: Uint8Array }> {
  return { nombre: 'padron.xlsx', bytes: await plantillaPadron() }
}

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
