'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2 } from 'lucide-react'

import { BLOQUES, bloquesPara } from './secciones'

/** Las 5 que entran en la barra inferior del telefono (variante C). */
const PRINCIPALES = BLOQUES[0].secciones

function activa(ruta: string, base: string, seccion: string): boolean {
  return ruta === `${base}/${seccion}` || ruta.startsWith(`${base}/${seccion}/`)
}

export function Navegacion({
  base,
  nombre,
  roles,
  id,
  etiqueta = 'Secciones',
}: {
  base: string
  nombre: string
  roles: readonly string[]
  id?: string
  etiqueta?: string
}) {
  const ruta = usePathname()

  return (
    <nav className="lateral" aria-label={etiqueta} id={id}>
      <Link
        className="lateral__consorcio"
        href={base}
        aria-current={ruta === base ? 'page' : undefined}
      >
        <Building2 className="icono" aria-hidden="true" />
        {nombre}
      </Link>
      {bloquesPara(roles).map((bloque) => (
        <section key={bloque.titulo} className="lateral__bloque" aria-label={bloque.titulo}>
          <h2>{bloque.titulo}</h2>
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
        </section>
      ))}
    </nav>
  )
}

/**
 * Variante C del prototipo: en telefono las principales al alcance del
 * pulgar, icono Lucide + etiqueta corta, siempre visible. En escritorio no
 * se muestra (ahi manda el lateral). Lleva su propio nombre de landmark
 * para no duplicar el del lateral ni el del menu.
 */
export function BarraInferior({ base }: { base: string }) {
  const ruta = usePathname()

  return (
    <nav className="barra-inferior" aria-label="Secciones principales">
      <ul>
        {PRINCIPALES.map((seccion) => (
          <li key={seccion.ruta}>
            <Link
              href={`${base}/${seccion.ruta}`}
              aria-current={activa(ruta, base, seccion.ruta) ? 'page' : undefined}
            >
              <seccion.Icono className="icono" aria-hidden="true" />
              {seccion.titulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
