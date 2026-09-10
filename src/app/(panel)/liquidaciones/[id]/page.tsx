import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verLiquidacion } from '@/aplicacion/liquidacion/ver-liquidacion'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'

import { BotonGenerarDocumentos } from '../../periodos/acciones-de-estado'

export const metadata: Metadata = { title: 'Liquidación — Flay' }

/**
 * Detalle de una liquidacion emitida (`CU-03`).
 *
 * Muestra **el desglose del interes por unidad**: es lo que permite responder
 * «de dónde salen estos pesos» sin abrir la base (RNF-10, research R-07).
 */
export default async function LiquidacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ consorcio?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { id } = await params
  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) redirect('/consorcios')

  try {
    const liquidacion = await verLiquidacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      liquidacionId: id,
    })
    const generados = liquidacion.detalles.filter((d) => d.tieneDocumento).length
    const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)

    return (
      <>
        <h1>Liquidación {liquidacion.periodo}</h1>
        <p className="apagado">
          {activo.nombre} · {liquidacion.estado} · vence {liquidacion.vencimiento}
        </p>

        {liquidacion.estado === 'anulada' && (
          <p className="aviso aviso--atencion" role="status">
            Esta liquidación fue anulada. Lo que se le emitió a los consorcistas no se reescribe: se
            reemplaza con una nueva, y las dos quedan registradas.
          </p>
        )}

        <div className="tarjeta">
          <p>
            Ordinario{' '}
            <strong className="cifra">{importeParaMostrar(liquidacion.totalOrdinario)}</strong> ·
            extraordinario{' '}
            <strong className="cifra">{importeParaMostrar(liquidacion.totalExtraordinario)}</strong>{' '}
            · total{' '}
            <strong className="cifra">{importeParaMostrar(liquidacion.totalGeneral)}</strong>
          </p>
        </div>

        {liquidacion.estado === 'vigente' && (
          <div className="tarjeta">
            <p>
              Documentos: <strong>{generados}</strong> de {liquidacion.detalles.length}
              {generados === liquidacion.detalles.length && ' · todos generados'}
            </p>
            {roles.includes('administrador') && generados < liquidacion.detalles.length && (
              <BotonGenerarDocumentos consorcioId={activo.id} liquidacionId={liquidacion.id} />
            )}
          </div>
        )}

        <div className="tabla-desplazable">
          <table>
            <caption className="ayuda">Detalle por unidad</caption>
            <thead>
              <tr>
                <th scope="col">Unidad</th>
                <th scope="col" className="numero">
                  Coeficiente %
                </th>
                <th scope="col" className="numero">
                  Ordinario
                </th>
                <th scope="col" className="numero">
                  Extraordinario
                </th>
                <th scope="col" className="numero">
                  Deuda anterior
                </th>
                <th scope="col" className="numero">
                  Interés
                </th>
                <th scope="col" className="numero">
                  Ajuste
                </th>
                <th scope="col" className="numero">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {liquidacion.detalles.map((detalle) => (
                <tr key={detalle.id}>
                  <td>{detalle.designacion}</td>
                  <td className="numero cifra">{detalle.coeficienteAplicado}</td>
                  <td className="numero cifra">{importeParaMostrar(detalle.importeOrdinario)}</td>
                  <td className="numero cifra">
                    {importeParaMostrar(detalle.importeExtraordinario)}
                  </td>
                  <td className="numero cifra">{importeParaMostrar(detalle.deudaAnterior)}</td>
                  <td className="numero cifra">
                    {importeParaMostrar(detalle.interesMora)}
                    {detalle.intereses.length > 0 && (
                      <span className="ayuda">
                        {' '}
                        {detalle.intereses
                          .map(
                            (linea) =>
                              `${importeParaMostrar(linea.capital)} × ${linea.tasaMensual} % × ${linea.meses}`,
                          )
                          .join(' + ')}
                      </span>
                    )}
                  </td>
                  <td className="numero cifra">{importeParaMostrar(detalle.ajusteRedondeo)}</td>
                  <td className="numero cifra">{importeParaMostrar(detalle.totalUnidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p>
          <Link href={`/periodos?consorcio=${activo.id}`}>Volver a períodos</Link>
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
