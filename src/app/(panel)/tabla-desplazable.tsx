'use client'

import { useEffect, useRef, useState, type HTMLAttributes } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { paginasAMostrar } from '@/compartido/paginas'

const POR_PAGINA = 20

/**
 * El contenedor de toda tabla (guia §7.6): desplaza adentro —la pagina nunca
 * se mueve a lo ancho (RNF-01)— y pagina de a 20 filas en el navegador. Las
 * filas las dibuja quien la usa, como siempre; esto solo oculta las que no
 * son de la pagina actual con `hidden`, asi sin JavaScript se ven todas.
 *
 * Una tabla que ya pagina en el servidor (Gastos, de a 10) nunca llega a 20
 * filas y no muestra controles. El editor del padron pasa `paginar={false}`:
 * ahi una fila oculta seria una fila que no se puede corregir.
 *
 * ponytail: pagina en el cliente, todas las filas viajan. Si una lista pasa
 * de unos miles de filas, paginarla en el caso de uso como Gastos.
 */
export function TablaDesplazable({
  paginar = true,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { paginar?: boolean }) {
  const caja = useRef<HTMLDivElement | null>(null)
  const [filas, setFilas] = useState(0)
  const [pagina, setPagina] = useState(1)
  // Sube con cada cambio de filas: un refresco en vivo puede traer filas
  // nuevas con la misma cantidad, y esas llegan sin `hidden`.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const tabla = caja.current?.querySelector('table')
    if (!paginar || !tabla) return
    const contar = () => {
      setFilas(tabla.querySelectorAll(':scope > tbody > tr').length)
      setVersion((v) => v + 1)
    }
    contar()
    // Solo `childList`: ocultar filas cambia atributos y no vuelve a disparar esto.
    const observador = new MutationObserver(contar)
    observador.observe(tabla, { childList: true, subtree: true })
    return () => observador.disconnect()
  }, [paginar])

  const paginas = Math.max(1, Math.ceil(filas / POR_PAGINA))
  const actual = Math.min(pagina, paginas)

  useEffect(() => {
    if (!paginar) return
    caja.current?.querySelectorAll(':scope > table > tbody > tr').forEach((fila, i) => {
      ;(fila as HTMLElement).hidden = Math.floor(i / POR_PAGINA) + 1 !== actual
    })
  }, [paginar, actual, version])

  const ir = (destino: number) => {
    setPagina(destino)
    caja.current?.scrollTo({ top: 0 })
  }

  const desde = (actual - 1) * POR_PAGINA + 1
  const hasta = Math.min(filas, actual * POR_PAGINA)

  return (
    <>
      <div ref={caja} className="tabla-desplazable" {...props}>
        {children}
      </div>
      {paginar && paginas > 1 && (
        <nav className="paginacion-tabla" aria-label="Páginas de la tabla">
          <p className="ayuda" aria-live="polite">
            Mostrando {desde}–{hasta} de {filas}
          </p>
          <ul className="paginacion">
            <li>
              <button
                type="button"
                onClick={() => ir(actual - 1)}
                disabled={actual === 1}
                aria-label="Página anterior"
              >
                <ChevronLeft className="icono" aria-hidden="true" />
              </button>
            </li>
            {paginasAMostrar(actual, paginas).map((numero) => (
              <li key={numero}>
                <button
                  type="button"
                  onClick={() => ir(numero)}
                  aria-current={numero === actual ? 'page' : undefined}
                  aria-label={`Página ${numero}`}
                >
                  {numero}
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => ir(actual + 1)}
                disabled={actual === paginas}
                aria-label="Página siguiente"
              >
                <ChevronRight className="icono" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </nav>
      )}
    </>
  )
}
