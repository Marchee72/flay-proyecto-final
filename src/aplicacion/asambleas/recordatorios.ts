import type { Reloj } from '@/dominio/contratos/reloj'
import { notificar } from '@/aplicacion/comunicacion/notificar'
import { enConsorcio } from '@/infraestructura/cliente-aislado'
import { prisma, prismaBase } from '@/infraestructura/prisma'

import { DIA_MS } from './comun'

/** Días que tienen los firmantes (art. 24 del reglamento, FR-034). */
export const DIAS_PARA_FIRMAR = 10

/**
 * Recordatorio de firmas pendientes (FR-034, research R-10). Lo corre la tarea
 * diaria, sin usuario ni consorcio activo. Va en dos pasos para no leer datos
 * de negocio fuera del aislamiento:
 *
 * 1. con el cliente base, solo los pares (acta, consorcio) vencidos;
 * 2. cada uno, dentro de `enConsorcio`, con el cliente aislado.
 */
export async function recordarFirmasPendientes(reloj: Reloj): Promise<{ avisadas: number }> {
  const limite = new Date(reloj.ahora().getTime() - DIAS_PARA_FIRMAR * DIA_MS)
  const vencidas = await prismaBase.actaAsamblea.findMany({
    where: { estado: 'a_firmar', recordatorioEnviadoEn: null, enviadaAFirmarEn: { lt: limite } },
    select: { id: true, consorcioId: true },
  })

  let avisadas = 0
  for (const { id, consorcioId } of vencidas) {
    await enConsorcio(consorcioId, async () => {
      const acta = await prisma.actaAsamblea.findFirst({
        where: { id, estado: 'a_firmar', recordatorioEnviadoEn: null },
        include: {
          firmantes: { where: { firmadoEn: null }, select: { usuarioId: true } },
          asamblea: { select: { id: true, titulo: true, dirigeId: true } },
        },
      })
      if (!acta) return
      const usuarios = new Set(acta.firmantes.map((f) => f.usuarioId))
      if (acta.asamblea.dirigeId) usuarios.add(acta.asamblea.dirigeId)

      await prisma.$transaction(async (tx) => {
        await notificar(
          tx,
          [...usuarios].map((usuarioId) => ({
            usuarioId,
            tipo: 'acta_a_firmar' as const,
            titulo: `Acta sin firmar: ${acta.asamblea.titulo}`,
            cuerpo: `Pasaron ${DIAS_PARA_FIRMAR} días y el acta todavía no tiene todas las firmas. Quien no pueda firmar se reemplaza desde la pantalla del acta.`,
            entidadTipo: 'asamblea',
            entidadId: acta.asamblea.id,
          })),
        )
        await tx.actaAsamblea.update({
          where: { id: acta.id },
          data: { recordatorioEnviadoEn: reloj.ahora() },
        })
      })
      avisadas += 1
    })
  }
  return { avisadas }
}
