import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/**
 * Armazon de las pantallas publicas —ingresar, fijar contraseña—: la marca en
 * grafito a la izquierda y el formulario a la derecha. En telefono queda solo
 * el formulario, con la marca arriba.
 */
export default function SesionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="acceso">
      <aside className="acceso__marca">
        <Link className="marca" href="/">
          FLAY
        </Link>
        <div className="acceso__lema">
          <p className="acceso__titular">
            Tu consorcio, <span>al día.</span>
          </p>
          <p>Expensas, reclamos, reservas y la documentación del edificio en un solo lugar.</p>
        </div>
        <small>UTN FRRo · Proyecto Final 2026</small>
      </aside>
      <main className="acceso__cuerpo">
        <Link className="acceso__volver" href="/">
          <ArrowLeft className="icono" aria-hidden="true" />
          Volver al inicio
        </Link>
        {children}
      </main>
    </div>
  )
}
