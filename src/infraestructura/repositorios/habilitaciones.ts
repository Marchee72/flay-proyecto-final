import type { AccesoVigente, RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
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
  async accesoVigente(usuarioId, consorcioId, fecha): Promise<AccesoVigente | null> {
    // 1. Plataforma: vale sobre cualquier consorcio.
    if (await this.esSuperAdministrador(usuarioId, fecha)) {
      return { usuarioId, consorcioId, roles: ['administrador'], origen: 'plataforma' }
    }

    // 2. Empresa: vale sobre los consorcios de esa administradora, y solo esos.
    const consorcio = await prismaBase.consorcio.findUnique({
      where: { id: consorcioId },
      select: { administradoraId: true },
    })

    if (!consorcio) return null

    const deLaEmpresa = await prismaBase.habilitacionAdministradora.findFirst({
      where: { usuarioId, administradoraId: consorcio.administradoraId, ...vigenteA(fecha) },
      select: { id: true },
    })

    if (deLaEmpresa) {
      return { usuarioId, consorcioId, roles: ['administrador'], origen: 'administradora' }
    }

    // 3. Consorcio: puede haber mas de una, porque el consejo se suma.
    const propias = await prismaBase.habilitacion.findMany({
      where: { usuarioId, consorcioId, ...vigenteA(fecha) },
      select: { rol: true },
    })

    if (propias.length === 0) return null

    return { usuarioId, consorcioId, roles: propias.map((h) => h.rol), origen: 'consorcio' }
  },

  async esSuperAdministrador(usuarioId, fecha): Promise<boolean> {
    const fila = await prismaBase.habilitacionPlataforma.findFirst({
      where: { usuarioId, ...vigenteA(fecha) },
      select: { id: true },
    })
    return fila !== null
  },

  async administradorasDe(usuarioId, fecha): Promise<string[]> {
    const filas = await prismaBase.habilitacionAdministradora.findMany({
      where: { usuarioId, ...vigenteA(fecha) },
      select: { administradoraId: true },
      distinct: ['administradoraId'],
    })
    return filas.map((f) => f.administradoraId)
  },

  async consorciosDe(usuarioId, fecha): Promise<string[]> {
    if (await this.esSuperAdministrador(usuarioId, fecha)) {
      const todos = await prismaBase.consorcio.findMany({ select: { id: true } })
      return todos.map((c) => c.id)
    }

    const administradoras = await this.administradorasDe(usuarioId, fecha)

    const [deEmpresas, propios] = await Promise.all([
      administradoras.length > 0
        ? prismaBase.consorcio.findMany({
            where: { administradoraId: { in: administradoras } },
            select: { id: true },
          })
        : Promise.resolve([]),
      prismaBase.habilitacion.findMany({
        where: { usuarioId, ...vigenteA(fecha) },
        select: { consorcioId: true },
        distinct: ['consorcioId'],
      }),
    ])

    return [...new Set([...deEmpresas.map((c) => c.id), ...propios.map((h) => h.consorcioId)])]
  },
}
