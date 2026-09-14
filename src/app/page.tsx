import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { LogIn } from 'lucide-react'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { consorciosAlAlcance } from './(panel)/con-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, destinoDeEntrada } from './(panel)/consorcio-activo'

export const metadata: Metadata = { title: 'Flay — Tu consorcio online' }

/**
 * Con sesión, `/` es la entrada al panel (diseño 2026-09-13 § 3.1): un solo
 * consorcio va derecho a su resumen; varios, al último usado o a la lista.
 * Sin sesión, la portada mínima: propuesta de valor + Ingresar.
 */
export default async function Portada() {
  const usuarioId = await usuarioDeLaSesion()
  if (usuarioId) {
    const consorcios = await consorciosAlAlcance(usuarioId)
    const recordado = (await cookies()).get(NOMBRE_GALLETA_CONSORCIO)?.value
    redirect(destinoDeEntrada(consorcios, recordado))
  }

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
