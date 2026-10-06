import { cookies } from 'next/headers'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, Inbox, LogOut } from 'lucide-react'

import { nombreDelUsuario, usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { salir } from './acciones'
import { Asistente } from './asistente/asistente'
import { Campana } from './campana'
import { consorciosAlAlcance } from './con-consorcio'
import { NOMBRE_GALLETA_CONSORCIO } from './consorcio-activo'
import { BarraInferior, Navegacion, NavegacionGlobal } from './navegacion'
import { SelectorDeConsorcio, type ConsorcioOpcion } from './selector-consorcio'

/**
 * El armazon del panel (rediseño 013, guia §7.1): un panel grafito flotante a
 * la izquierda con todo lo que no es la pantalla —marca, avisos, consorcio,
 * navegacion y la sesion— y el contenido sobre el fondo claro. Sin barra
 * superior: son 64 px mas de alto util y una sola franja oscura.
 *
 * Dentro de un consorcio recibe `consorcio` y suma el selector y las
 * secciones; afuera (la lista, la bandeja) queda solo lo global. En telefono
 * el mismo panel se vuelve la cabecera y las secciones pasan a la barra
 * inferior flotante.
 */
export async function Marco({
  consorcio,
  children,
}: {
  consorcio?: {
    consorcios: ConsorcioOpcion[]
    activoId: string
    base: string
    roles: readonly string[]
  }
  children: React.ReactNode
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')
  const nombre = await nombreDelUsuario(usuarioId)

  // El asistente esta en todo el panel. Dentro de un consorcio se ancla a ese; afuera,
  // al ultimo usado (galleta, validada contra el alcance) o al primero.
  const alAlcance = await consorciosAlAlcance(usuarioId)
  const recordado = (await cookies()).get(NOMBRE_GALLETA_CONSORCIO)?.value
  const anclaId =
    consorcio?.activoId ?? alAlcance.find((c) => c.id === recordado)?.id ?? alAlcance[0]?.id

  return (
    <div className="marco">
      <aside className="panel">
        <div className="panel__cabeza">
          <Link className="marca" href="/">
            FLAY
          </Link>
          <div className="panel__acciones">
            <Link className="panel__icono" href="/consorcios" aria-label="Consorcios">
              <Building2 className="icono" aria-hidden="true" />
            </Link>
            <Link className="panel__icono" href="/bandeja" aria-label="Bandeja">
              <Inbox className="icono" aria-hidden="true" />
            </Link>
            <Campana />
            <form action={salir} className="solo-telefono-flex">
              <button className="panel__icono" type="submit" aria-label="Salir">
                <LogOut className="icono" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>

        {consorcio && (
          <SelectorDeConsorcio consorcios={consorcio.consorcios} activoId={consorcio.activoId} />
        )}

        {/* Adentro de un consorcio la lista y la bandeja son los iconos de arriba;
            afuera no hay secciones y van con su nombre. */}
        {!consorcio && <NavegacionGlobal />}

        {consorcio && <Navegacion base={consorcio.base} roles={consorcio.roles} />}

        <div className="panel__pie">
          <span className="avatar" aria-hidden="true">
            {iniciales(nombre)}
          </span>
          <span className="panel__nombre">{nombre}</span>
          <form action={salir}>
            <button className="panel__icono" type="submit" aria-label="Salir">
              <LogOut className="icono" aria-hidden="true" />
            </button>
          </form>
        </div>
      </aside>

      <main className="contenido">{children}</main>

      {anclaId && <Asistente consorcios={alAlcance} anclaId={anclaId} enCartera={!consorcio} />}

      {consorcio && <BarraInferior base={consorcio.base} roles={consorcio.roles} />}
    </div>
  )
}

/** «Adriana Delta» → «AD». Sin nombre, la inicial del correo la pone quien llama. */
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]!.toUpperCase())
    .join('')
}
