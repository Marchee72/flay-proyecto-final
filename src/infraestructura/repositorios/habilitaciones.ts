import { cache } from 'react'

import type { AccesoVigente, RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import { prismaBase } from '@/infraestructura/prisma'

/**
 * Habilitaciones. Va contra el cliente crudo a proposito: es lo que **decide**
 * el aislamiento, asi que no puede estar sujeto a el (seria circular).
 *
 * Una habilitacion no vigente equivale a inexistente (FR-004): la vigencia se
 * evalua contra la fecha, no contra la existencia de la fila.
 *
 * Las consultas estan cacheadas por peticion con `React.cache()` usando el
 * milisegundo de la fecha para evitar ejecuciones N+1 redundantes durante
 * el ciclo de vida de una misma solicitud (RNF-06).
 */
const vigenteA = (fecha: Date) => ({
  vigenciaDesde: { lte: fecha },
  OR: [{ vigenciaHasta: null }, { vigenciaHasta: { gte: fecha } }],
})

const esSuperAdministradorMemo = cache(
  async (usuarioId: string, fechaTiempo: number): Promise<boolean> => {
    const fecha = new Date(fechaTiempo)
    const fila = await prismaBase.habilitacionPlataforma.findFirst({
      where: { usuarioId, ...vigenteA(fecha) },
      select: { id: true },
    })
    return fila !== null
  },
)

const administradorasDeMemo = cache(
  async (usuarioId: string, fechaTiempo: number): Promise<string[]> => {
    const fecha = new Date(fechaTiempo)
    const filas = await prismaBase.habilitacionAdministradora.findMany({
      where: { usuarioId, ...vigenteA(fecha) },
      select: { administradoraId: true },
      distinct: ['administradoraId'],
    })
    return filas.map((f) => f.administradoraId)
  },
)

const accesoVigenteMemo = cache(
  async (
    usuarioId: string,
    consorcioId: string,
    fechaTiempo: number,
  ): Promise<AccesoVigente | null> => {
    const fecha = new Date(fechaTiempo)

    // 1. Plataforma: vale sobre cualquier consorcio.
    if (await esSuperAdministradorMemo(usuarioId, fechaTiempo)) {
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
)

const consorciosDeMemo = cache(
  async (usuarioId: string, fechaTiempo: number): Promise<string[]> => {
    const fecha = new Date(fechaTiempo)

    if (await esSuperAdministradorMemo(usuarioId, fechaTiempo)) {
      const todos = await prismaBase.consorcio.findMany({ select: { id: true } })
      return todos.map((c) => c.id)
    }

    const administradoras = await administradorasDeMemo(usuarioId, fechaTiempo)

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
)

export const repositorioHabilitaciones: RepositorioHabilitaciones = {
  accesoVigente(usuarioId, consorcioId, fecha) {
    return accesoVigenteMemo(usuarioId, consorcioId, fecha.getTime())
  },

  esSuperAdministrador(usuarioId, fecha) {
    return esSuperAdministradorMemo(usuarioId, fecha.getTime())
  },

  administradorasDe(usuarioId, fecha) {
    return administradorasDeMemo(usuarioId, fecha.getTime())
  },

  consorciosDe(usuarioId, fecha) {
    return consorciosDeMemo(usuarioId, fecha.getTime())
  },
}
