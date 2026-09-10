import type { TipoTrabajo } from '@prisma/client'

import { prismaBase } from '@/infraestructura/prisma'

/**
 * Drenaje oportunista de TrabajoPendiente (FR-006b).
 *
 * Lo dispara el siguiente pedido que llega, despues de responder, en vez de una
 * tarea programada: la capa gratuita admite una corrida diaria y una invitacion
 * que espera 24 h es peor que reintentar en el proximo pedido. El plan lo
 * declara como cumplimiento diferido de la clausula de notificaciones.
 *
 * El lote se **reclama** en una transaccion corta y se despacha **fuera** de
 * ella: sostener la transaccion durante una llamada externa mantendria bloqueos
 * abiertos por toda la latencia del proveedor. `SKIP LOCKED` es lo que evita
 * que dos pedidos simultaneos despachen el mismo trabajo.
 */

const LOTE = 5
const INTENTOS_MAXIMOS = 6
const ESPERA_BASE_SEGUNDOS = 30

export type Manejador = (carga: unknown) => Promise<void>

type Reclamado = { id: string; tipo: TipoTrabajo; carga: unknown; intentos: number }

export async function drenar(
  manejadores: Partial<Record<TipoTrabajo, Manejador>>,
): Promise<{ despachados: number; fallidos: number }> {
  const lote = await reclamar()
  let despachados = 0
  let fallidos = 0

  for (const trabajo of lote) {
    const manejador = manejadores[trabajo.tipo]

    if (!manejador) continue // otro despliegue lo maneja; queda pendiente

    try {
      await manejador(trabajo.carga)
      await prismaBase.trabajoPendiente.update({
        where: { id: trabajo.id },
        data: { estado: 'despachado', ultimoError: null },
      })
      despachados++
    } catch (error) {
      fallidos++
      await prismaBase.trabajoPendiente.update({
        where: { id: trabajo.id },
        data: {
          ultimoError: error instanceof Error ? error.message.slice(0, 500) : 'desconocido',
          // Agotado no es «perdido»: queda visible y el administrador reintenta.
          estado: trabajo.intentos >= INTENTOS_MAXIMOS ? 'agotado' : 'pendiente',
        },
      })
    }
  }

  return { despachados, fallidos }
}

/** Toma hasta LOTE trabajos vencidos y les corre el proximo intento. */
async function reclamar(): Promise<Reclamado[]> {
  return prismaBase.$queryRaw<Reclamado[]>`
    UPDATE "TrabajoPendiente" AS t
    SET intentos = t.intentos + 1,
        proximo_intento = now() + (interval '1 second' * ${ESPERA_BASE_SEGUNDOS} * power(2, t.intentos)),
        actualizado_en = now()
    WHERE t.id IN (
      SELECT id FROM "TrabajoPendiente"
      WHERE estado = 'pendiente' AND proximo_intento <= now()
      ORDER BY proximo_intento
      LIMIT ${LOTE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING t.id, t.tipo, t.carga, t.intentos
  `
}

/**
 * Reenvio explicito del administrador: adelanta el proximo intento a ahora y
 * revive lo agotado, sin esperar la espera creciente (FR-006b, SC-013b).
 *
 * El «ahora» es el de la **base**, como el del vencimiento: con el reloj del
 * proceso unos milisegundos adelantado —lo normal contra una base
 * administrada— el reenvio quedaria en el futuro y el drenaje siguiente no lo
 * veria.
 */
export async function reintentarAhora(id: string): Promise<void> {
  await prismaBase.$executeRaw`
    UPDATE "TrabajoPendiente"
    SET estado = 'pendiente', proximo_intento = now(), intentos = 0, actualizado_en = now()
    WHERE id = ${id}::uuid
  `
}
