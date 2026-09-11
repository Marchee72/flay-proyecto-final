import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { coeficienteParaMostrar } from '@/compartido/formato'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'

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
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }

  return (
    <>
      <EncabezadoDeConsorcio
        nombre={consorcio.nombre}
        volverHref="/consorcios"
        volverTexto="Volver a consorcios"
      />
      <h1>{consorcio.nombre}</h1>
      <p className="apagado">
        {consorcio.direccion}, {consorcio.localidad} · CUIT {consorcio.cuit}
      </p>

      <div className="tarjeta">
        <h2>Padrón</h2>
        <p>
          {consorcio.unidades.length} unidades · suma de coeficientes{' '}
          <strong className="cifra">{coeficienteParaMostrar(consorcio.suma)}</strong> %
        </p>

        {consorcio.unidades.length === 0 ? (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              Todavía no hay unidades cargadas. Un consorcio vacío es válido; lo que no puede quedar
              es un padrón a medias.
            </span>
          </p>
        ) : (
          !consorcio.cuadra && (
            <p className="aviso aviso--problema" role="alert">
              <Siren className="icono" aria-hidden="true" />
              <span>
                Los coeficientes no cierran: la diferencia es{' '}
                <span className="cifra">{coeficienteParaMostrar(consorcio.diferencia)}</span> %.
              </span>
            </p>
          )
        )}

        <p>
          <Link className="boton boton--fantasma" href={`/consorcios/${consorcio.id}/unidades`}>
            Ver unidades
          </Link>
        </p>
      </div>
    </>
  )
}
