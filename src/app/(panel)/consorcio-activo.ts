/**
 * Consorcio activo persistente (guía §3.4): qué consorcio dibuja cada pantalla.
 *
 * Prioridad: `?consorcio=` válido > galleta `flay_consorcio` válida > ninguno
 * (aviso RNF-10). Un `?consorcio=` presente pero no alcanzable NO cae a la
 * galleta: muestra «no está al alcance», porque la dirección pedía otro
 * consorcio y dibujar uno distinto confundiría.
 *
 * Solo presentación: la galleta nunca se confía sin validar contra la lista
 * de alcanzables (`misConsorcios`), y cada operación la sigue autorizando su
 * caso de uso contra la base (FR-002). Esto solo decide qué se dibuja.
 */
export const NOMBRE_GALLETA_CONSORCIO = 'flay_consorcio'

export type ConsorcioAlcanzable = { id: string; nombre: string }

export type ParametrosDeConsorcio = { consorcio?: string }

export function resolverConsorcioActivo<T extends ConsorcioAlcanzable>(
  parametros: ParametrosDeConsorcio,
  consorcios: T[],
  galleta?: string | null,
): { activo?: T; pedidoDesconocido: boolean } {
  const pedido = parametros.consorcio

  if (pedido !== undefined) {
    const porParametro = consorcios.find((consorcio) => consorcio.id === pedido)
    if (porParametro) return { activo: porParametro, pedidoDesconocido: false }
    return { activo: undefined, pedidoDesconocido: true }
  }

  if (galleta) {
    const porGalleta = consorcios.find((consorcio) => consorcio.id === galleta)
    if (porGalleta) return { activo: porGalleta, pedidoDesconocido: false }
  }

  return { activo: undefined, pedidoDesconocido: false }
}
