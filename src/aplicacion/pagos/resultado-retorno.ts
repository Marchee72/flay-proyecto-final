import type { ResultadoConciliacion } from './conciliar-pago-en-linea'

/**
 * Estado de la vista de retorno cuando la confirmacion contra la pasarela fallo
 * (`RF-28`, `D-4`).
 *
 * La URL de retorno la controla el cliente: `status=approved` no prueba que el
 * pago se haya imputado. Solo un rechazo explicito se cree; el resto queda
 * pendiente y lo resuelve el sondeo.
 */
export function resultadoDeRetorno(parametros: {
  collection_status?: string
  status?: string
}): 'rechazado' | 'pendiente' {
  if (parametros.collection_status === 'rejected' || parametros.status === 'rejected') {
    return 'rechazado'
  }
  return 'pendiente'
}

/**
 * Que muestra la vista de la expensa tras conciliar los intentos (`RF-28`).
 * Un aprobado se muestra siempre; la espera y el rechazo solo si alguien sigue
 * ese intento (`?intentoId`), porque a una visita comun no le corresponden.
 */
export function estadoDeConciliacion(
  resultados: readonly ResultadoConciliacion[],
  seguido: boolean,
): 'aprobado' | 'rechazado' | 'pendiente' | null {
  if (resultados.some((r) => r.estado === 'aprobado')) return 'aprobado'
  if (!seguido) return null
  if (resultados.some((r) => r.estado === 'esperando')) return 'pendiente'
  if (resultados.some((r) => r.estado === 'rechazado')) return 'rechazado'
  return null
}
