/**
 * Memoria del ultimo consorcio usado. Ya no es el contexto —el consorcio vive
 * en la ruta, `/consorcios/[consorcio]/...`—; solo decide a donde manda `/`
 * y las direcciones viejas sin consorcio. Nunca se confia sin validar contra
 * `misConsorcios`.
 */
export const NOMBRE_GALLETA_CONSORCIO = 'flay_consorcio'

export const OPCIONES_GALLETA_CONSORCIO = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
} as const

/**
 * Con un solo consorcio no hay nada que elegir; con varios, el recordado si
 * sigue al alcance. Uno archivado (RN-22) nunca es el destino por defecto: se
 * llega a el desde Archivados, no al entrar.
 */
export function destinoDeEntrada(
  todos: { id: string; archivadoEn?: string | null }[],
  recordado: string | undefined,
  seccion = '',
): string {
  const consorcios = todos.filter((c) => !c.archivadoEn)
  if (consorcios.length === 1) return `/consorcios/${consorcios[0].id}${seccion}`
  const ultimo = consorcios.find((c) => c.id === recordado)
  if (ultimo) return `/consorcios/${ultimo.id}${seccion}`
  return '/consorcios'
}

/**
 * A donde va el atajo de la barra: misma seccion en el otro consorcio. Las
 * fichas de detalle (`/gastos/<id>`) no existen alla, asi que se salta a la
 * lista de esa seccion.
 */
export function destinoEnOtroConsorcio(origen: string, elegido: string): string {
  const dentro = origen.match(/^\/consorcios\/[^/?]+(\/[^?]*)?(\?.*)?$/)
  if (!dentro) return `/consorcios/${elegido}`
  const seccion = (dentro[1] ?? '').split('/')[1] ?? ''
  return `/consorcios/${elegido}${seccion ? `/${seccion}` : ''}`
}

/**
 * Con unidades en dos o mas edificios se elige al entrar, aunque haya uno
 * recordado (RF-03). La condicion es por unidades, no por rol: quien
 * administra y ademas es dueño en dos edificios tambien elige.
 */
export function eligeAlEntrar(unidades: ReadonlyMap<string, readonly string[]>): boolean {
  return [...unidades.values()].filter((designaciones) => designaciones.length > 0).length >= 2
}
