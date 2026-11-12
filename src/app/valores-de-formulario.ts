/**
 * Lo que la persona tipeó, para devolverlo al formulario cuando la acción
 * rechaza. Sin `'use client'` a proposito: lo importan las Server Actions
 * (nota 28: el error vuelve por `useActionState` y los campos por `valores`).
 *
 * Se descartan las claves internas de Next (`$ACTION…`), las que la acción
 * pide no devolver (contraseñas) y los archivos: un `File` no viaja como valor
 * de un `<input>` y no se puede serializar de vuelta al formulario.
 */
export type ConValores = { valores?: Record<string, string> }

export function valoresDe(datos: FormData, sin: readonly string[] = []): Record<string, string> {
  const valores: Record<string, string> = {}
  for (const [clave, valor] of datos.entries()) {
    if (clave.startsWith('$ACTION') || sin.includes(clave) || typeof valor !== 'string') continue
    valores[clave] = valor
  }
  return valores
}
