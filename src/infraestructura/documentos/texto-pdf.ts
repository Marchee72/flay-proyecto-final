import { extractText, getDocumentProxy } from 'unpdf'

import type { PaginaDeTexto } from '@/dominio/documentos/fragmentar'

/**
 * Texto por pagina de un documento (research R-05). PDF con `unpdf`, la
 * compilacion de pdf.js para entornos sin DOM; texto plano o Markdown, tal
 * cual, como una sola pagina. Nada mas: HEIC, imagenes y planillas no se
 * indexan en esta etapa.
 */
export async function textoPorPagina(
  bytes: Uint8Array,
  tipoContenido: string,
): Promise<PaginaDeTexto[]> {
  if (tipoContenido === 'application/pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: false })
    return text.map((texto, i) => ({ pagina: i + 1, texto }))
  }
  if (tipoContenido.startsWith('text/')) {
    return [{ pagina: 1, texto: new TextDecoder().decode(bytes) }]
  }
  throw new Error(`No se puede extraer texto de ${tipoContenido}: solo PDF y texto.`)
}
