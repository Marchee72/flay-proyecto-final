import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface PaginacionProps {
  pagina: number
  paginas: number
  urlParaPagina: (pagina: number) => string
  etiquetaAria?: string
}

/**
 * Paginación accesible para tablas y listados (§ 3.4).
 * Renderiza botones anterior/siguiente y hasta 5 páginas centradas en la actual.
 */
export function Paginacion({
  pagina,
  paginas,
  urlParaPagina,
  etiquetaAria = 'Paginación',
}: PaginacionProps) {
  if (paginas <= 1) return null

  const lista = paginasAMostrar(pagina, paginas)

  return (
    <nav aria-label={etiquetaAria}>
      <ul className="paginacion">
        {pagina > 1 && (
          <li>
            <Link href={urlParaPagina(pagina - 1)}>
              <ChevronLeft className="icono" aria-hidden="true" />
              Anterior
            </Link>
          </li>
        )}
        {lista.map((num) => (
          <li key={num}>
            {num === pagina ? (
              <Link
                href={urlParaPagina(num)}
                aria-current="page"
                aria-label={`Página ${num}, página actual`}
              >
                {num}
              </Link>
            ) : (
              <Link href={urlParaPagina(num)} aria-label={`Ir a la página ${num}`}>
                {num}
              </Link>
            )}
          </li>
        ))}
        {pagina < paginas && (
          <li>
            <Link href={urlParaPagina(pagina + 1)}>
              Siguiente
              <ChevronRight className="icono" aria-hidden="true" />
            </Link>
          </li>
        )}
      </ul>
    </nav>
  )
}

/**
 * Ventana de hasta 5 páginas centrada en la actual (solo presentación): evita
 * una fila de decenas de enlaces cuando el listado crece.
 */
export function paginasAMostrar(actual: number, total: number): number[] {
  const inicio = Math.max(1, Math.min(actual - 2, total - 4))
  const fin = Math.min(total, inicio + 4)
  const paginas: number[] = []
  for (let p = inicio; p <= fin; p++) paginas.push(p)
  return paginas
}
