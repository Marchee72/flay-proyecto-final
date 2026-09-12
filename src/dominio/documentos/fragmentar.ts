/**
 * Fragmentacion de un documento para la busqueda (`RF-20`, research R-05).
 * Pura: texto por pagina adentro, fragmentos numerados afuera.
 *
 * Si el documento tiene articulos numerados («Art. 12.», «Artículo 12»), cada
 * articulo es un fragmento: es la unidad de sentido de un reglamento y lo que
 * la prueba de concepto midio al 100 %. Si no, se agrupan parrafos hasta
 * ~1.000 caracteres, repitiendo el ultimo parrafo del fragmento anterior como
 * solapamiento, para que una idea cortada quede entera en alguno de los dos.
 */

export interface PaginaDeTexto {
  pagina: number
  texto: string
}

export interface Fragmento {
  numero: number
  pagina: number | null
  contenido: string
}

const TAMANO_OBJETIVO = 1000
const ARTICULO = /^(?:Art\.?|Art[íi]culo)\s*\d+\s*[.:°º-]/i

export function fragmentar(paginas: PaginaDeTexto[]): Fragmento[] {
  const parrafos = paginas.flatMap((p) =>
    p.texto
      .split(/\n\s*\n|\r\n\s*\r\n/)
      .map((texto) => texto.replace(/\s+/g, ' ').trim())
      .filter((texto) => texto.length > 0)
      .map((texto) => ({ pagina: p.pagina, texto })),
  )
  if (parrafos.length === 0) return []

  const porArticulo = parrafos.filter((p) => ARTICULO.test(p.texto)).length
  return porArticulo >= 3 ? fragmentarPorArticulos(parrafos) : fragmentarPorParrafos(parrafos)
}

/** Un fragmento por articulo; lo que precede al primero (titulos, capitulos) va con el primero. */
function fragmentarPorArticulos(parrafos: { pagina: number; texto: string }[]): Fragmento[] {
  const fragmentos: Fragmento[] = []
  let actual: { pagina: number; partes: string[] } | null = null
  let encabezado: string[] = []

  for (const parrafo of parrafos) {
    if (ARTICULO.test(parrafo.texto)) {
      if (actual) fragmentos.push(cerrar(fragmentos.length + 1, actual))
      actual = { pagina: parrafo.pagina, partes: [...encabezado, parrafo.texto] }
      encabezado = []
    } else if (actual) {
      actual.partes.push(parrafo.texto)
    } else {
      // Titulo de capitulo antes del primer articulo: contexto, no fragmento.
      encabezado = [parrafo.texto]
    }
  }
  if (actual) fragmentos.push(cerrar(fragmentos.length + 1, actual))
  return fragmentos
}

function fragmentarPorParrafos(parrafos: { pagina: number; texto: string }[]): Fragmento[] {
  const fragmentos: Fragmento[] = []
  let actual: { pagina: number; partes: string[]; largo: number } | null = null

  for (const parrafo of parrafos) {
    if (
      actual &&
      actual.largo + parrafo.texto.length > TAMANO_OBJETIVO &&
      actual.partes.length > 0
    ) {
      fragmentos.push(cerrar(fragmentos.length + 1, actual))
      const ultimo: string = actual.partes[actual.partes.length - 1]
      // Solapamiento: el ultimo parrafo del anterior abre el siguiente.
      actual = { pagina: parrafo.pagina, partes: [ultimo], largo: ultimo.length }
    }
    if (!actual) actual = { pagina: parrafo.pagina, partes: [], largo: 0 }
    actual.partes.push(parrafo.texto)
    actual.largo += parrafo.texto.length
  }
  if (actual && actual.partes.length > 0) fragmentos.push(cerrar(fragmentos.length + 1, actual))
  return fragmentos
}

const cerrar = (numero: number, actual: { pagina: number; partes: string[] }): Fragmento => ({
  numero,
  pagina: actual.pagina,
  contenido: actual.partes.join('\n'),
})
