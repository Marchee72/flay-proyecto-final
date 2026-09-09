import type {
  HabilitacionVigente,
  RepositorioHabilitaciones,
} from '@/dominio/contratos/repositorios'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Habilitaciones. Va contra el cliente crudo a proposito: es lo que **decide**
 * el aislamiento, asi que no puede estar sujeto a el (seria circular).
 *
 * Una habilitacion no vigente equivale a inexistente (FR-004): la vigencia se
 * evalua contra la fecha, no contra la existencia de la fila.
 */
const vigenteA = (fecha: Date) => ({
  vigenciaDesde: { lte: fecha },
  OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fecha } }],
})

export const repositorioHabilitaciones: RepositorioHabilitaciones = {
  async vigente(usuarioId, consorcioId, fecha): Promise<HabilitacionVigente | null> {
    const fila = await prismaBase.habilitacion.findFirst({
      where: { usuarioId, consorcioId, ...vigenteA(fecha) },
      select: { usuarioId: true, consorcioId: true, rol: true },
    })
    return fila
  },

  async esAdministradorDeCartera(usuarioId, fecha): Promise<boolean> {
    const fila = await prismaBase.habilitacionCartera.findFirst({
      where: { usuarioId, ...vigenteA(fecha) },
      select: { id: true },
    })
    return fila !== null
  },

  async consorciosDe(usuarioId, fecha): Promise<string[]> {
    const filas = await prismaBase.habilitacion.findMany({
      where: { usuarioId, ...vigenteA(fecha) },
      select: { consorcioId: true },
      distinct: ['consorcioId'],
    })
    return filas.map((f) => f.consorcioId)
  },
}
