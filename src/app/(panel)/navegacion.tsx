'use client'

import { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CalendarCheck,
  ChevronDown,
  FileText,
  House,
  Inbox,
  Menu,
  MessageSquareWarning,
} from 'lucide-react'

import { bloquesPara } from './secciones'

function activa(ruta: string, base: string, seccion: string): boolean {
  return ruta === `${base}/${seccion}` || ruta.startsWith(`${base}/${seccion}/`)
}

/** Lo que no depende de un consorcio: la lista y la bandeja. */
export function NavegacionGlobal() {
  const ruta = usePathname()
  return (
    <nav className="panel__global" aria-label="Panel">
      <Link href="/consorcios" aria-current={ruta === '/consorcios' ? 'page' : undefined}>
        <Building2 className="icono" aria-hidden="true" />
        Consorcios
      </Link>
      <Link href="/bandeja" aria-current={ruta === '/bandeja' ? 'page' : undefined}>
        <Inbox className="icono" aria-hidden="true" />
        Bandeja
      </Link>
    </nav>
  )
}

export function Navegacion({
  base,
  roles,
  id,
  etiqueta = 'Secciones',
}: {
  base: string
  roles: readonly string[]
  id?: string
  etiqueta?: string
}) {
  const ruta = usePathname()

  return (
    <nav className="lateral" aria-label={etiqueta} id={id}>
      {/* El nombre del consorcio ya lo pone el conmutador de arriba: aca va la seccion. */}
      <Link href={base} aria-current={ruta === base ? 'page' : undefined}>
        <House className="icono" aria-hidden="true" />
        Resumen
      </Link>
      {bloquesPara(roles).map((bloque) => (
        <Bloque
          key={bloque.titulo}
          titulo={bloque.titulo}
          contieneActiva={bloque.secciones.some((seccion) => activa(ruta, base, seccion.ruta))}
        >
          {bloque.secciones.map((seccion) => (
            <Link
              key={seccion.ruta}
              href={`${base}/${seccion.ruta}`}
              aria-current={activa(ruta, base, seccion.ruta) ? 'page' : undefined}
            >
              <seccion.Icono className="icono" aria-hidden="true" />
              {seccion.titulo}
            </Link>
          ))}
        </Bloque>
      ))}
    </nav>
  )
}

const CLAVE = (titulo: string) => `flay-bloque-${titulo}`

/**
 * Un bloque del menu que se pliega hacia su titulo (patron acordeon de la
 * APG: el boton va dentro del `h2`, asi sigue siendo un encabezado). Plegado
 * se recuerda en este navegador; si la seccion actual queda adentro de uno
 * plegado, se abre solo para que la activa se vea.
 */
function Bloque({
  titulo,
  contieneActiva,
  children,
}: {
  titulo: string
  contieneActiva: boolean
  children: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(true)
  const id = useId()

  useEffect(() => {
    try {
      if (localStorage.getItem(CLAVE(titulo)) === 'plegado') setAbierto(false)
    } catch {
      // Sin almacenamiento (ventana privada): queda abierto.
    }
  }, [titulo])
  useEffect(() => {
    if (contieneActiva) setAbierto(true)
  }, [contieneActiva])

  const alternar = () => {
    const siguiente = !abierto
    setAbierto(siguiente)
    try {
      if (siguiente) localStorage.removeItem(CLAVE(titulo))
      else localStorage.setItem(CLAVE(titulo), 'plegado')
    } catch {
      // Sin almacenamiento: el pliegue dura hasta recargar.
    }
  }

  return (
    <section className="lateral__bloque" aria-label={titulo}>
      <h2>
        <button type="button" aria-expanded={abierto} aria-controls={id} onClick={alternar}>
          {titulo}
          <ChevronDown className="icono lateral__chevron" aria-hidden="true" />
        </button>
      </h2>
      <div id={id} className="lateral__enlaces" hidden={!abierto}>
        {children}
      </div>
    </section>
  )
}

/** Las que entran en la barra del telefono; el resto, detras de «Más». */
const PRINCIPALES = [
  { ruta: '', titulo: 'Resumen', Icono: House },
  { ruta: 'expensas', titulo: 'Expensas', Icono: FileText },
  { ruta: 'reclamos', titulo: 'Reclamos', Icono: MessageSquareWarning },
  { ruta: 'reservas', titulo: 'Reservas', Icono: CalendarCheck },
]

/**
 * En telefono las principales al alcance del pulgar, en una barra flotante; el
 * resto de las secciones se abre desde «Más», como hoja sobre la barra. En
 * escritorio no se muestra (ahi manda el panel). Lleva su propio nombre de
 * landmark para no duplicar el del panel ni el del menu.
 */
export function BarraInferior({ base, roles }: { base: string; roles: readonly string[] }) {
  const ruta = usePathname()

  return (
    <div className="barra-inferior">
      <nav aria-label="Secciones principales">
        <ul>
          {PRINCIPALES.map((seccion) => {
            const destino = seccion.ruta ? `${base}/${seccion.ruta}` : base
            const actual = seccion.ruta ? activa(ruta, base, seccion.ruta) : ruta === base
            return (
              <li key={seccion.titulo}>
                <Link
                  href={destino}
                  aria-label={seccion.titulo}
                  aria-current={actual ? 'page' : undefined}
                >
                  <seccion.Icono className="icono" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <details className="menu">
        <summary aria-label="Todas las secciones">
          <Menu className="icono" aria-hidden="true" />
        </summary>
        <Navegacion base={base} roles={roles} etiqueta="Todas las secciones" />
      </details>
    </div>
  )
}
