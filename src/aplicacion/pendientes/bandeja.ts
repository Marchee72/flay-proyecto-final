import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { estadoDeLaCola, type EstadoDeLaCola } from '@/aplicacion/comunicacion/despachar'
import { prismaBase } from '@/infraestructura/prisma'

export interface Bandeja {
  consorcios: {
    id: string
    nombre: string
    reclamos: { id: string; titulo: string; urgencia: string; fechaApertura: string }[]
    periodosAbiertos: string[]
  }[]
  /** La cola de avisos es de toda la plataforma; solo la ve quien administra algo. */
  cola: EstadoDeLaCola | null
}

/**
 * Lo pendiente de todos los consorcios que el usuario administra (diseno
 * 2026-09-13 § 4.3): reclamos sin resolver y periodos sin liquidar, agrupados
 * por consorcio. Cruza consorcios, asi que va contra el cliente crudo, y por
 * eso la regla: el `IN` se arma desde el alcance del usuario, nunca desde un
 * parametro. Quien no administra ninguno recibe la bandeja vacia, no un error.
 */
export async function verBandeja(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string },
): Promise<Bandeja> {
  const hoy = reloj.hoy()
  const administrados: string[] = []
  for (const consorcioId of await repositorio.consorciosDe(datos.usuarioId, hoy)) {
    const acceso = await repositorio.accesoVigente(datos.usuarioId, consorcioId, hoy)
    if (acceso?.roles.includes('administrador')) administrados.push(consorcioId)
  }
  if (administrados.length === 0) return { consorcios: [], cola: null }

  const [consorcios, reclamos, periodos, cola] = await Promise.all([
    prismaBase.consorcio.findMany({
      where: { id: { in: administrados } },
      select: { id: true, nombre: true },
      orderBy: { nombre: 'asc' },
    }),
    prismaBase.reclamo.findMany({
      where: {
        consorcioId: { in: administrados },
        estado: { in: ['abierto', 'asignado', 'en_curso'] },
      },
      select: { id: true, consorcioId: true, titulo: true, urgencia: true, fechaApertura: true },
      orderBy: [{ urgencia: 'desc' }, { fechaApertura: 'asc' }],
    }),
    prismaBase.periodo.findMany({
      where: { consorcioId: { in: administrados }, estado: 'abierto' },
      select: { consorcioId: true, anio: true, mes: true },
      orderBy: [{ anio: 'asc' }, { mes: 'asc' }],
    }),
    estadoDeLaCola(),
  ])

  return {
    consorcios: consorcios.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      reclamos: reclamos
        .filter((r) => r.consorcioId === c.id)
        .map((r) => ({
          id: r.id,
          titulo: r.titulo,
          urgencia: r.urgencia,
          fechaApertura: r.fechaApertura.toISOString(),
        })),
      periodosAbiertos: periodos
        .filter((p) => p.consorcioId === c.id)
        .map((p) => `${String(p.mes).padStart(2, '0')}/${p.anio}`),
    })),
    cola,
  }
}
