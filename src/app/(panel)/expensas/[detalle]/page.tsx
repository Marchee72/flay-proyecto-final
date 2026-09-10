import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verExpensa } from '@/aplicacion/liquidacion/ver-expensa'

export const metadata: Metadata = { title: 'Expensa — Flay' }

/**
 * Una expensa por identificador directo (`CU-06`, SC-008).
 *
 * Es la pantalla que el paso 5 del guion de demostracion ataca: pedir por la
 * direccion la expensa de otra unidad responde «no encontrado», nunca
 * «prohibido». La decision la toma el caso de uso; aca se muestra el mensaje.
 */
export default async function ExpensaPage({
  params,
  searchParams,
}: {
  params: Promise<{ detalle: string }>
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { detalle } = await params
  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) redirect('/consorcios')

  try {
    const expensa = await verExpensa(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      detalleId: detalle,
    })

    return (
      <>
        <h1>
          Expensa {expensa.periodo} · unidad {expensa.designacion}
        </h1>
        <p className="apagado">
          {activo.nombre} · vence {expensa.vencimiento}
        </p>

        <div className="tarjeta">
          <p>
            Total a pagar{' '}
            <strong className="cifra">{importeParaMostrar(expensa.totalUnidad)}</strong>
          </p>

          {expensa.direccion ? (
            <p>
              <a className="boton boton--primario" href={expensa.direccion} download>
                Descargar la expensa
              </a>
            </p>
          ) : (
            <p className="aviso aviso--atencion" role="status">
              El documento todavía se está generando. La liquidación ya está emitida: volvé en unos
              minutos.
            </p>
          )}
        </div>

        <p>
          <Link href={`/expensas?consorcio=${activo.id}`}>Volver a expensas</Link>
        </p>
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        {error.mensajeParaUsuario}
      </p>
    )
  }
}
