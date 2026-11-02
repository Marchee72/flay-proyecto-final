/**
 * Un destino de redireccion que vino de afuera (`?desde=`, un campo oculto)
 * solo se usa si es una ruta interna: empieza con `prefijo`, no es `//host`
 * ni `/\host` (los navegadores leen las dos como otro origen), no trae
 * caracteres de control (el navegador descarta tabs y saltos, y `/\t/host` se
 * vuelve `//host`) y no vuelve a `/ingresar`. Cualquier otra cosa da
 * `porDefecto`: no hay redireccion abierta.
 */
export function destinoSeguro(valor: unknown, porDefecto: string, prefijo = '/'): string {
  if (typeof valor !== 'string') return porDefecto
  if (/[\u0000-\u001f\u007f]/.test(valor)) return porDefecto
  if (!valor.startsWith(prefijo) || valor.startsWith('//') || valor.includes('\\')) {
    return porDefecto
  }
  if (valor.startsWith('/ingresar')) return porDefecto
  return valor
}
