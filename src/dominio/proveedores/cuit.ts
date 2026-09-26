/**
 * El CUIT como identidad del proveedor (`RF-05`). Se tipea de muchas formas
 * —con guiones, con espacios, sin nada— y la unicidad por consorcio solo
 * sirve si todas terminan en la misma cadena: `NN-NNNNNNNN-N`, el formato que
 * ya usa la extraccion de comprobantes.
 *
 * ponytail: no verifica el digito verificador (modulo 11) porque los datos
 * ficticios de la demostracion no lo cumplen; se agrega cuando haya datos
 * reales, junto con un CHECK en la base.
 */
export function normalizarCuit(texto: string): string | null {
  const digitos = texto.replace(/\D/g, '')
  if (digitos.length !== 11) return null
  return `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos[10]}`
}
