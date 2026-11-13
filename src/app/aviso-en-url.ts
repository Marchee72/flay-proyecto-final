/**
 * Lo que acaba de pasar, dicho una sola vez. Las Server Actions redirigen con
 * `conHecho(ruta, clave)` y el texto vive aca: antes el mismo mensaje estaba
 * escrito en la pagina de destino de cada accion, con una bandera distinta por
 * accion —y con `?registrado=1` queriendo decir dos cosas distintas, pago y
 * reclamo—.
 *
 * Sin `'use client'` a proposito: lo importan las acciones del servidor y la
 * pila de avisos del cliente (decision 19).
 */
export const HECHO = {
  'enlace-enviado': 'Le mandamos un correo con un enlace para elegir una contraseña nueva.',
  'administradora-creada': 'Administradora creada. Ya podés darle de alta consorcios.',
  'contrasena-guardada': 'La contraseña quedó guardada. Ya se puede entrar.',
  despachado: 'Se despachó lo que había pendiente.',
  'periodo-cerrado': 'Período cerrado. Ya no admite más gastos.',
  liquidado: 'Liquidación emitida. Las expensas ya están en cada unidad.',
  anulado: 'Liquidación anulada. Los pagos aplicados quedaron como saldo a favor.',
  'gasto-registrado': 'Gasto registrado. Si hay comprobante, adjuntarlo a continuación.',
  'gasto-actualizado': 'Gasto actualizado.',
  'proveedor-actualizado': 'Proveedor actualizado.',
  'gasto-eliminado': 'Gasto eliminado.',
  'pago-registrado': 'Pago registrado e imputado a lo más viejo primero.',
  'pasarela-configurada': 'Credenciales de la pasarela de pagos guardadas.',
  'padron-guardado': 'Padrón guardado. Los cambios de coeficiente rigen desde hoy.',
  'reclamo-registrado': 'Reclamo registrado. La administración lo va a asignar.',
  'reclamo-actualizado': 'Reclamo actualizado.',
  'reclamo-asignado': 'Reclamo asignado.',
  'gasto-vinculado': 'Gasto vinculado al reclamo.',
  'sugerencia-resuelta': 'Sugerencia resuelta.',
  'reserva-confirmada': 'Reserva confirmada. Te llega un aviso por correo.',
  'reserva-cancelada': 'Reserva cancelada.',
  'espacio-guardado': 'Espacio guardado.',
  'espacio-alta': 'Espacio habilitado; vuelve a admitir reservas.',
  'espacio-baja': 'Espacio dado de baja; las reservas futuras quedaron canceladas y avisadas.',
  'novedad-publicada': 'Novedad publicada y avisada.',
  'documento-cargado':
    'Documento cargado. Se procesa en segundo plano; cuando diga «Procesado» ya entra en las consultas.',
  'documento-reindexado': 'El documento se volvió a encolar para indexar.',
  'indicadores-actualizados': 'Indicadores actualizados.',
  invitado:
    'Invitación creada. El correo con el enlace sale en el próximo pedido; abajo se ve su estado.',
  'acceso-sumado': 'Ya tenía cuenta en Flay: le dimos acceso a este consorcio.',
  'unidad-asignada': 'Unidad asignada.',
  'acceso-quitado': 'Acceso quitado. Ya no puede entrar a este consorcio.',
  'invitacion-reenviada': 'Invitación reenviada. Si vuelve a fallar, el estado lo dice acá.',
  'proveedor-registrado': 'Proveedor dado de alta.',
  'extraccion-descartada': 'Extracción descartada. No se creó ningún gasto.',
  'asamblea-guardada': 'Asamblea guardada en borrador. Revisala y, cuando esté lista, convocá.',
  'asamblea-convocada': 'Convocatoria enviada a los propietarios, en Flay y por correo.',
  'asamblea-convocada-sin-contacto':
    'Convocatoria enviada. Hay propietarios sin cuenta ni correo: convocalos por otro medio (abajo está la lista).',
  'asamblea-borrada': 'Borrador eliminado.',
  'asamblea-cancelada': 'Asamblea cancelada. Se avisó a los convocados.',
  'poder-otorgado': 'Poder otorgado. El apoderado ya puede acreditarse por la unidad.',
  'poder-revocado': 'Poder revocado.',
  'asamblea-abierta': 'Asamblea abierta: ya se puede acreditar la asistencia.',
  acreditado: 'Asistencia registrada.',
  'autoridades-designadas': 'Presidente y secretario designados.',
  'asamblea-constituida': 'Asamblea constituida: ya se pueden tratar los puntos.',
  'punto-abierto': 'Punto en votación.',
  'punto-cerrado': 'Punto cerrado con su resultado.',
  'voto-registrado': 'Voto registrado.',
  'direccion-tomada': 'Ahora dirigís la asamblea.',
  'asamblea-finalizada': 'Asamblea finalizada. Falta redactar el acta.',
  'oposicion-registrada': 'Oposición registrada.',
  'resumen-guardado': 'Resúmenes guardados.',
  'borrador-pedido': 'Pedimos el borrador: llega en unos segundos.',
  'firmantes-designados': 'Firmantes designados.',
  'acta-enviada': 'Acta enviada a firmar. Su texto ya no cambia.',
  'acta-firmada': 'Firma registrada.',
  'firmante-reemplazado': 'Firmante reemplazado. Se le avisó para que firme.',
  'reglas-guardadas': 'Reglas guardadas. Rigen para las próximas convocatorias.',
} as const satisfies Record<string, string>

export type ClaveHecho = keyof typeof HECHO

/**
 * `aviso=<unico>` hace que la misma accion repetida dos veces seguidas —cerrar
 * dos periodos uno tras otro— termine en una direccion distinta y la pila
 * vuelva a avisar: la pila mira la cadena de busqueda, no el objeto.
 */
function conAviso(ruta: string, nombre: 'hecho' | 'error', valor: string): string {
  const [camino, busqueda] = ruta.split('?', 2)
  const parametros = new URLSearchParams(busqueda)
  parametros.set(nombre, valor)
  parametros.set('aviso', crypto.randomUUID().slice(0, 8))
  return `${camino}?${parametros}`
}

export function conHecho(ruta: string, clave: ClaveHecho): string {
  return conAviso(ruta, 'hecho', clave)
}

export function conError(ruta: string, texto: string): string {
  return conAviso(ruta, 'error', texto)
}
