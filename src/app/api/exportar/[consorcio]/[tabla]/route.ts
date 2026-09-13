import { BOM } from '@/compartido/csv'
import { ErrorDeAplicacion, NoEncontrado } from '@/compartido/errores'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import {
  encabezadoCsv,
  type PaginaExportada,
  paginaExportada,
  TABLAS,
  type TablaExportable,
} from '@/aplicacion/exportar/exportar'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

/**
 * `GET /api/exportar/{consorcio}/{gastos|liquidaciones|pagos}.csv` (research
 * R-13, `FR-032b`): sesion, habilitacion vigente sobre ese consorcio y 404 para
 * cualquier otro. Se emite en flujo, una pagina por vez.
 */
export async function GET(
  _pedido: Request,
  contexto: { params: Promise<{ consorcio: string; tabla: string }> },
): Promise<Response> {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return new Response('Iniciá sesión para exportar.', { status: 401 })

  const { consorcio, tabla: pedida } = await contexto.params
  const tabla = pedida.replace(/\.csv$/, '')
  if (!(TABLAS as readonly string[]).includes(tabla)) return new Response(null, { status: 404 })

  // La primera pagina se pide antes de abrir el flujo: asi el 404 de un
  // consorcio ajeno es un 404 y no un CSV cortado.
  let pagina: PaginaExportada
  try {
    pagina = await paginaExportada(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: consorcio,
      tabla: tabla as TablaExportable,
    })
  } catch (error) {
    if (error instanceof NoEncontrado) return new Response(null, { status: 404 })
    if (error instanceof ErrorDeAplicacion) {
      return new Response(error.mensajeParaUsuario, { status: 403 })
    }
    throw error
  }

  const codificador = new TextEncoder()
  const flujo = new ReadableStream<Uint8Array>({
    start(controlador) {
      controlador.enqueue(codificador.encode(BOM + encabezadoCsv(tabla as TablaExportable)))
      controlador.enqueue(codificador.encode(pagina.lineas.join('')))
      if (!pagina.siguiente) controlador.close()
    },
    async pull(controlador) {
      if (!pagina.siguiente) return
      pagina = await paginaExportada(HABILITACIONES, RELOJ, {
        usuarioId,
        consorcioId: consorcio,
        tabla: tabla as TablaExportable,
        despuesDe: pagina.siguiente,
      })
      controlador.enqueue(codificador.encode(pagina.lineas.join('')))
      if (!pagina.siguiente) controlador.close()
    },
  })

  return new Response(flujo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${tabla}-${consorcio}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
