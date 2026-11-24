import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { Landing } from './landing'
import { consorciosAlAlcance, unidadesPorConsorcio } from './(panel)/con-consorcio'
import {
  NOMBRE_GALLETA_CONSORCIO,
  destinoDeEntrada,
  eligeAlEntrar,
} from './(panel)/consorcio-activo'

export const metadata: Metadata = { title: 'Flay — Tu consorcio online' }

/**
 * Con sesión, `/` es la entrada al panel (diseño 2026-09-13 § 3.1): un solo
 * consorcio va derecho a su resumen; varios, al último usado o a la lista.
 * Con unidades en dos o más edificios, siempre a la lista: se elige (RF-03).
 * Sin sesión, la landing: qué es Flay, para quién, y una sola acción, Ingresar.
 */
export default async function Portada() {
  const usuarioId = await usuarioDeLaSesion()
  if (usuarioId) {
    const [consorcios, unidades] = await Promise.all([
      consorciosAlAlcance(usuarioId),
      unidadesPorConsorcio(usuarioId),
    ])
    if (eligeAlEntrar(unidades)) redirect('/consorcios')
    const recordado = (await cookies()).get(NOMBRE_GALLETA_CONSORCIO)?.value
    redirect(destinoDeEntrada(consorcios, recordado))
  }

  return <Landing />
}
