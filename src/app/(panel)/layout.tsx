import Link from 'next/link'
import { redirect } from 'next/navigation'
import { after } from 'next/server'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'

import { salir } from './acciones'
import { Navegacion } from './navegacion'

/**
 * Armazon del panel. Ademas del marco visual, es donde el drenaje oportunista
 * de TrabajoPendiente se engancha con `after()`: corre despues de responder, de
 * modo que reintentar un correo no le agrega latencia a nadie (FR-006b).
 *
 * Exige sesion, no permiso: quien no tiene identidad vuelve a ingresar. **Que**
 * puede hacer lo decide cada caso de uso contra la base (FR-002), porque el
 * armazon corre en paralelo con la pagina y no puede ser la unica barrera.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await usuarioDeLaSesion())) redirect('/ingresar')

  after(async () => {
    // Cada historia agrega su manejador; lo que no tiene ninguno queda
    // pendiente y lo toma el proximo pedido.
    await drenar(MANEJADORES)
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

        <form action={salir} className="salida">
          <button className="boton boton--fantasma" type="submit">
            Salir
          </button>
        </form>
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
