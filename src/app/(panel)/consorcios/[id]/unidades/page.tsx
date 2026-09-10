import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { coeficienteParaMostrar } from '@/compartido/formato'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { CargadorDePadron } from './cargador'

export const metadata: Metadata = { title: 'Unidades — Flay' }

export default async function UnidadesPage({ params }: { params: Promise<{ id: string }> }) {
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
      <h1>Unidades de {consorcio.nombre}</h1>

      {consorcio.unidades.length === 0 ? (
        <>
          <p className="apagado">
            El padrón se carga entero de una vez: unidad por unidad la suma nunca daría 100 y cada
            alta sería un rechazo.
          </p>
          <CargadorDePadron consorcioId={consorcio.id} />
        </>
      ) : (
        <div className="tabla-desplazable">
          <table>
            <caption className="ayuda">Padrón vigente</caption>
            <thead>
              <tr>
                <th scope="col">Designación</th>
                <th scope="col" className="numero">
                  Coeficiente %
                </th>
              </tr>
            </thead>
            <tbody>
              {consorcio.unidades.map((unidad) => (
                <tr key={unidad.id}>
                  <td>{unidad.designacion}</td>
                  <td className="numero cifra">{coeficienteParaMostrar(unidad.coeficiente)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="numero cifra">{coeficienteParaMostrar(consorcio.suma)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p>
        <Link href={`/consorcios/${consorcio.id}`}>Volver al consorcio</Link>
      </p>
    </>
  )
}
