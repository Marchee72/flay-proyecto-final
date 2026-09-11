import type { Metadata } from 'next'
import Link from 'next/link'
import { LogIn } from 'lucide-react'

export const metadata: Metadata = { title: 'Flay — Tu consorcio online' }

/**
 * Portada mínima (Fase B3): propuesta de valor + una sola acción primaria,
 * Ingresar. Sin lógica de negocio: la sesión se resuelve en `/ingresar`.
 */
export default function Portada() {
  return (
    <div className="acceso">
      <div>
        <span className="marca">FLAY</span>
        <h1>Tu consorcio online</h1>
        <p className="apagado">Expensas claras, gastos auditables y avisos a tiempo.</p>
        <Link className="boton boton--primario" href="/ingresar">
          <LogIn className="icono" aria-hidden="true" />
          Ingresar
        </Link>
        <p className="ayuda">
          Si todavía no tiene cuenta, el administrador le envía la invitación por correo.
        </p>
      </div>
    </div>
  )
}
