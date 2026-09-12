import { z } from 'zod'

import { NoEncontrado } from '@/compartido/errores'
import type { ClasificadorTexto, RubroParaClasificar } from '@/dominio/contratos/asistencia'
import type { RepositorioHabilitaciones } from '@/dominio/contratos/repositorios'
import type { Reloj } from '@/dominio/contratos/reloj'
import { conAutorizacion } from '@/aplicacion/autorizacion'
import type { Manejador } from '@/aplicacion/pendientes/drenar'
import { prisma, prismaBase } from '@/infraestructura/prisma'

/**
 * Triage asistido (`RF-12`, `CU-14`, `FR-027`, research R-10): una
 * `SugerenciaReclamo` que el administrador aplica o descarta. **Nunca** toca el
 * estado del reclamo (Principio IV). El manejador corre en la cola, con el
 * clasificador que el punto de composicion eligio; con la nula, no hay
 * sugerencia y el reclamo sigue igual (PI-09).
 */

const CARGA = z.object({ reclamoId: z.string().uuid() })

/** Codigos cortos para el clasificador: un modelo de lenguaje no maneja bien identificadores largos. */
export async function rubrosParaClasificar(): Promise<
  { codigo: string; nombre: string; descripcion: string; id: string }[]
> {
  const rubros = await prismaBase.rubroGasto.findMany({ orderBy: { nombre: 'asc' } })
  return rubros.map((rubro, i) => ({
    codigo: `R${String(i + 1).padStart(2, '0')}`,
    nombre: rubro.nombre,
    descripcion:
      rubro.clasificacion === 'ordinario' ? 'Gasto corriente' : 'Obra o gasto no recurrente',
    id: rubro.id,
  }))
}

export function manejadorTriage(clasificador: ClasificadorTexto): Manejador {
  return async (carga) => {
    const { reclamoId } = CARGA.parse(carga)
    // Fuera de todo contexto de aislamiento: la cola no tiene consorcio activo.
    const reclamo = await prismaBase.reclamo.findUnique({ where: { id: reclamoId } })
    if (!reclamo) return
    const yaTiene = await prismaBase.sugerenciaReclamo.findUnique({ where: { reclamoId } })
    if (yaTiene) return

    const rubros = await rubrosParaClasificar()
    const proveedores = await prismaBase.proveedor.findMany({
      where: { consorcioId: reclamo.consorcioId },
      include: { rubroHabitual: { select: { nombre: true } } },
    })

    const resultado = await clasificador.clasificar(
      { titulo: reclamo.titulo, descripcion: reclamo.descripcion },
      {
        rubros: rubros.map(
          ({ codigo, nombre, descripcion }): RubroParaClasificar => ({
            codigo,
            nombre,
            descripcion,
          }),
        ),
        proveedores: proveedores.map((p) => ({
          id: p.id,
          nombre: p.razonSocial,
          rubros: p.rubroHabitual ? [p.rubroHabitual.nombre] : [],
        })),
      },
    )
    // Sin servicio no hay sugerencia, y no es un error: el reclamo ya existe.
    if (!resultado.disponible) return

    const { valor } = resultado
    await prismaBase.sugerenciaReclamo.create({
      data: {
        reclamoId,
        rubroSugeridoId: rubros.find((r) => r.codigo === valor.rubroCodigo)?.id ?? null,
        urgenciaSugerida: valor.urgencia,
        // El sistema no inventa proveedores: solo uno de los del consorcio.
        proveedorSugeridoId: proveedores.some((p) => p.id === valor.proveedorId)
          ? valor.proveedorId
          : null,
        horasEstimadas: valor.horasEstimadas,
        confianza: valor.confianza,
      },
    })
  }
}

export async function aplicarSugerencia(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; reclamoId: string },
): Promise<void> {
  return resolverSugerencia(repositorio, reloj, datos, true)
}

export async function descartarSugerencia(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; reclamoId: string },
): Promise<void> {
  return resolverSugerencia(repositorio, reloj, datos, false)
}

async function resolverSugerencia(
  repositorio: RepositorioHabilitaciones,
  reloj: Reloj,
  datos: { usuarioId: string; consorcioId: string; reclamoId: string },
  aceptada: boolean,
): Promise<void> {
  return conAutorizacion(
    repositorio,
    reloj,
    {
      usuarioId: datos.usuarioId,
      consorcioId: datos.consorcioId,
      rolesPermitidos: ['administrador'],
      accion: 'resolver la sugerencia',
    },
    async () => {
      const reclamo = await prisma.reclamo.findFirst({
        where: { id: datos.reclamoId },
        include: { sugerencia: true },
      })
      if (!reclamo?.sugerencia) throw new NoEncontrado()
      const s = reclamo.sugerencia

      await prisma.$transaction(async (tx) => {
        await tx.sugerenciaReclamo.update({ where: { id: s.id }, data: { aceptada } })
        if (aceptada) {
          // Copia rubro, urgencia y proveedor. El estado y el responsable no se tocan.
          await tx.reclamo.update({
            where: { id: reclamo.id },
            data: {
              ...(s.rubroSugeridoId ? { rubroId: s.rubroSugeridoId } : {}),
              ...(s.urgenciaSugerida ? { urgencia: s.urgenciaSugerida } : {}),
              ...(s.proveedorSugeridoId ? { proveedorId: s.proveedorSugeridoId } : {}),
            },
          })
        }
      })
    },
  )
}
