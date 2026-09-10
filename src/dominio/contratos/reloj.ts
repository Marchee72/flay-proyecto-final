/**
 * El dominio no llama al reloj del sistema: lo recibe. Es lo que permite probar
 * la vigencia de una habilitacion o de un coeficiente sin esperar al calendario.
 */
export interface Reloj {
  ahora(): Date
  /** Fecha sin hora, en la zona del consorcio, para comparar vigencias. */
  hoy(): Date
}
