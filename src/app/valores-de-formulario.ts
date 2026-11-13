/**
 * Lo que la persona tipeó, para devolverlo al formulario cuando la acción
 * rechaza. Sin `'use client'` a proposito: lo importan las Server Actions
 * (nota 28: el error vuelve por `useActionState` y los campos por `valores`).
 *
 * Se descartan las claves internas de Next (`$ACTION…`), las que la acción
 * pide no devolver (contraseñas) y los archivos: un `File` no viaja como valor
 * de un `<input>` y no se puede serializar de vuelta al formulario.
 *
 * Los `<select>` necesitan una cosa más. React no re-aplica su `defaultValue`
 * al actualizarse, y el reinicio del formulario que hace React 19 después de
 * la acción los devuelve a la opción marcada al montar (un `value` controlado
 * tampoco sobrevive: el reinicio corre después y React no lo repone). Por eso
 * cada desplegable lleva `key={estado.valores?.<campo> ?? 'inicial'}`: se
 * remonta con lo que volvió, y eso es lo que el reinicio respeta.
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
