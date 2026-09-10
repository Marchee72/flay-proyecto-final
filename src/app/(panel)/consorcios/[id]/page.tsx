import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

export const metadata: Metadata = { title: 'Consorcio — Flay' }

export default async function ConsorcioPage({ params }: { params: Promise<{ id: string }> }) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { id } = await params

  let consorcio
  try {
    consorcio = await verConsorcio(HABILITACIONES, RELOJ, { usuarioId, consorcioId: id })
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        {error.mensajeParaUsuario}
      </p>
    )
  }

  return (
    <>
      <h1>{consorcio.nombre}</h1>
      <p className="apagado">
        {consorcio.direccion}, {consorcio.localidad} · CUIT {consorcio.cuit}
      </p>

      <div className="tarjeta">
        <h2>Padrón</h2>
        <p>
          {consorcio.unidades.length} unidades · suma de coeficientes{' '}
          <strong className="cifra">{consorcio.suma}</strong> %
        </p>

        {consorcio.unidades.length === 0 ? (
          <p className="aviso aviso--atencion" role="status">
            Todavía no hay unidades cargadas. Un consorcio vacío es válido; lo que no puede quedar
            es un padrón a medias.
          </p>
        ) : (
          !consorcio.cuadra && (
            <p className="aviso aviso--problema" role="alert">
              Los coeficientes no cierran: la diferencia es{' '}
              <span className="cifra">{consorcio.diferencia}</span> %.
            </p>
          )
        )}

        <p>
          <Link className="boton boton--fantasma" href={`/consorcios/${consorcio.id}/unidades`}>
            Ver unidades
          </Link>
        </p>
      </div>

      <p>
        <Link href="/consorcios">Volver a consorcios</Link>
      </p>
    </>
  )
}
