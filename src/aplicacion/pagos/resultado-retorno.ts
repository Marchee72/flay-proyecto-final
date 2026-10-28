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
