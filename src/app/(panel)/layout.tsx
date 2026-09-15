import Link from 'next/link'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { Building2, Inbox } from 'lucide-react'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'

import { salir } from './acciones'

/**
 * Armazon del panel: barra superior con lo que no depende de un consorcio
 * (la lista, la bandeja, salir). El lateral de secciones vive un nivel mas
 * abajo, en `consorcios/[consorcio]/layout.tsx`, porque afuera de un
 * consorcio no significa nada.
 *
 * Es tambien donde el drenaje oportunista de TrabajoPendiente se engancha con
 * `after()`: corre despues de responder, de modo que reintentar un correo no
 * le agrega latencia a nadie (FR-006b).
 *
 * Exige sesion, no permiso: quien no tiene identidad vuelve a ingresar. **Que**
 * puede hacer lo decide cada caso de uso contra la base (FR-002), porque el
 * armazon corre en paralelo con la pagina y no puede ser la unica barrera.
 */
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  after(async () => {
    // Cada historia agrega su manejador; lo que no tiene ninguno queda
    // pendiente y lo toma el proximo pedido.
    await drenar(MANEJADORES)
  })

  return (
    <div className="armazon">
      <header className="barra">
        <Link className="marca" href="/">
          FLAY
        </Link>

        <nav className="barra__global" aria-label="Panel">
          <Link href="/consorcios" aria-label="Consorcios">
            <Building2 className="icono" aria-hidden="true" />
            <span className="barra__texto">Consorcios</span>
          </Link>
          <Link href="/bandeja" aria-label="Bandeja">
            <Inbox className="icono" aria-hidden="true" />
            <span className="barra__texto">Bandeja</span>
          </Link>
        </nav>

        <form action={salir} className="salida">
          <button className="boton boton--fantasma" type="submit">
            Salir
          </button>
        </form>
      </header>

      <div className="envoltorio">{children}</div>
    </div>
  )
}
