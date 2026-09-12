'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  FileText,
  Gauge,
  MessageSquareWarning,
  Receipt,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
} from 'lucide-react'

/** Secciones del punto 12. El consorcio activo vive en la barra, no aca. */
export const SECCIONES = [
  { href: '/consorcios', titulo: 'Consorcios', Icono: Building2 },
  { href: '/gastos', titulo: 'Gastos', Icono: Receipt },
  { href: '/periodos', titulo: 'Períodos', Icono: CalendarDays },
  { href: '/expensas', titulo: 'Expensas', Icono: FileText },
  { href: '/pagos', titulo: 'Pagos', Icono: Wallet },
  { href: '/morosidad', titulo: 'Morosidad', Icono: TriangleAlert },
  { href: '/reclamos', titulo: 'Reclamos', Icono: MessageSquareWarning },
  { href: '/reservas', titulo: 'Reservas', Icono: CalendarCheck },
  { href: '/indicadores', titulo: 'Indicadores', Icono: Gauge },
  { href: '/proveedores', titulo: 'Proveedores', Icono: Truck },
  { href: '/usuarios', titulo: 'Usuarios', Icono: Users },
] as const

/** Las 5 que entran en la barra inferior del telefono (variante C). */
const PRINCIPALES = ['/periodos', '/gastos', '/expensas', '/pagos', '/morosidad'] as const

export function Navegacion({ id, etiqueta = 'Secciones' }: { id?: string; etiqueta?: string }) {
  const ruta = usePathname()

  return (
    <nav className="lateral" aria-label={etiqueta} id={id}>
      {SECCIONES.map((seccion) => (
        <Link
          key={seccion.href}
          href={seccion.href}
          aria-current={ruta.startsWith(seccion.href) ? 'page' : undefined}
        >
          <seccion.Icono className="icono" aria-hidden="true" />
          {seccion.titulo}
        </Link>
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
export function BarraInferior() {
  const ruta = usePathname()
  const principales = SECCIONES.filter((seccion) =>
    (PRINCIPALES as readonly string[]).includes(seccion.href),
  )

  return (
    <nav className="barra-inferior" aria-label="Secciones principales">
      <ul>
        {principales.map((seccion) => (
          <li key={seccion.href}>
            <Link
              href={seccion.href}
              aria-current={ruta.startsWith(seccion.href) ? 'page' : undefined}
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
