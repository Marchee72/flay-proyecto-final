'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Secciones del punto 12. El consorcio activo vive en la barra, no aca. */
export const SECCIONES = [
  { href: '/consorcios', titulo: 'Consorcios' },
  { href: '/gastos', titulo: 'Gastos' },
  { href: '/periodos', titulo: 'Períodos' },
  { href: '/proveedores', titulo: 'Proveedores' },
  { href: '/usuarios', titulo: 'Usuarios' },
] as const

export function Navegacion({ id }: { id?: string }) {
  const ruta = usePathname()

  return (
    <nav className="lateral" aria-label="Secciones" id={id}>
      {SECCIONES.map((seccion) => (
        <Link
          key={seccion.href}
          href={seccion.href}
          aria-current={ruta.startsWith(seccion.href) ? 'page' : undefined}
        >
          {seccion.titulo}
        </Link>
      ))}
    </nav>
  )
}
