/**
 * Validador de correo (RF-03). Puro: lo llaman la pantalla al tipear y los casos
 * de uso al guardar, con el mismo mensaje. Recorta espacios antes de validar.
 */
const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function errorDeCorreo(texto: string): string | null {
  const correo = texto.trim()
  if (correo === '') return 'Escribí el correo.'
  if (!FORMATO_CORREO.test(correo)) {
    return 'Ese correo no tiene un formato válido: revisá que tenga @ y un dominio, como nombre@ejemplo.com.'
  }
  return null
}
