import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { Menu } from 'lucide-react'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { drenar } from '@/aplicacion/pendientes/drenar'
import { MANEJADORES } from '@/aplicacion/pendientes/manejadores'

import { salir } from './acciones'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from './consorcio-activo'
import { BarraInferior, Navegacion } from './navegacion'
import { SelectorDeConsorcio } from './selector-consorcio'

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
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)

  // El selector de la barra muestra el consorcio recordado en la galleta
  // (guía §3.4). El armazón no ve `?consorcio=`, pero `src/middleware.ts` lo
  // espeja en la galleta antes de renderizar: barra y pantalla van juntas.
  // Cada pantalla igual resuelve lo suyo con `resolverConsorcioActivo`,
  // donde el parámetro manda.
  const galletas = await cookies()
  const { activo: recordado } = resolverConsorcioActivo(
    {},
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )
  const recordadoId = recordado?.id

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

        <details className="menu">
          <summary aria-label="Abrir menú de navegación">
            <Menu className="icono" aria-hidden="true" />
          </summary>
          <Navegacion etiqueta="Todas las secciones" />
        </details>

        <SelectorDeConsorcio consorcios={consorcios} activoId={recordadoId} />

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

      <BarraInferior />
    </div>
  )
}
