import type { Metadata } from 'next'
import { Briefcase } from 'lucide-react'

import { misAdministradoras } from '@/aplicacion/administradoras/mis-administradoras'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { irAIngresar } from '@/app/ir-a-ingresar'
import { ErrorDeAplicacion } from '@/compartido/errores'

import { AvisoDeError } from '../con-consorcio'
import { Marco } from '../marco'
import { FormularioAdministradora } from './formulario'

export const metadata: Metadata = { title: 'Administradoras — Flay' }

export default async function AdministradorasPage() {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) return irAIngresar()

  // Solo el superadministrador de plataforma da de alta administradoras (SC-002c).
  const esSuper = await HABILITACIONES.esSuperAdministrador(usuarioId, RELOJ.hoy())
  if (!esSuper) {
    return (
      <Marco>
        <h1>Administradoras</h1>
        <AvisoDeError
          error={new ErrorDeAplicacion('Tu rol no permite ver las administradoras.', 'RNF-03')}
        />
      </Marco>
    )
  }

  const administradoras = await misAdministradoras(HABILITACIONES, RELOJ, usuarioId)

  return (
    <Marco>
      <h1>Administradoras</h1>
      <p className="apagado">Las empresas que administran carteras de consorcios.</p>

      {administradoras.length === 0 ? (
        <div className="vacio">
          <Briefcase aria-hidden="true" />
          <p>Todavía no hay ninguna administradora.</p>
        </div>
      ) : (
        <ul className="lista-simple">
          {administradoras.map((a) => (
            <li key={a.id}>
              {a.razonSocial} <span className="apagado">· {a.cuit}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="tarjeta">
        <h2>Nueva administradora</h2>
        <FormularioAdministradora />
      </div>
    </Marco>
  )
}
