import Link from 'next/link'
import { after } from 'next/server'

import { drenar } from '@/aplicacion/pendientes/drenar'

import { Navegacion } from './navegacion'

/**
 * Armazon del panel. Ademas del marco visual, es donde el drenaje oportunista
 * de TrabajoPendiente se engancha con `after()`: corre despues de responder, de
 * modo que reintentar un correo no le agrega latencia a nadie (FR-006b).
 */
export default function PanelLayout({ children }: { children: React.ReactNode }) {
  after(async () => {
    // Los manejadores los aporta cada historia; sin ninguno, el trabajo queda
    // pendiente y lo toma el proximo pedido.
    await drenar({})
  })

  return (
    <>
      <header className="barra">
        <Link className="marca" href="/">
          FLAY
        </Link>

        <details className="menu">
          <summary aria-label="Abrir menú de navegación">
            <svg
              className="icono"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M4 12h16" />
              <path d="M4 18h16" />
              <path d="M4 6h16" />
            </svg>
          </summary>
          <Navegacion />
        </details>
      </header>

      <div className="envoltorio">
        <div className="disposicion">
          <Navegacion />
          <main>{children}</main>
        </div>
      </div>
    </>
  )
}
