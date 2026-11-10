const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/**
 * Un identificador que llega por la direccion (`?periodo=`, `[consorcio]`) y
 * va a una columna `uuid`: si no lo es, la base lo rechaza con un error que la
 * pantalla no sabe decir (RNF-10). Se filtra antes de consultar.
 */
export function esUuid(valor: string | undefined): valor is string {
  return valor !== undefined && UUID.test(valor)
}
