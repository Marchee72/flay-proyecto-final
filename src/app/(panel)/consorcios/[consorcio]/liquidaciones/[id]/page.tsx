import type { Metadata } from 'next'
import { Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { coeficienteParaMostrar, fechaParaMostrar, importeParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verLiquidacion } from '@/aplicacion/liquidacion/ver-liquidacion'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'

import { BotonGenerarDocumentos } from '../../periodos/acciones-de-estado'
import { conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

export const metadata: Metadata = { title: 'Liquidación — Flay' }

/**
 * Detalle de una liquidacion emitida (`CU-03`).
 *
 * Muestra **el desglose del interes por unidad**: es lo que permite responder
 * «de dónde salen estos pesos» sin abrir la base (RNF-10, research R-07).
 */
export default async function LiquidacionPage({
  params,
}: {
  params: Promise<{ consorcio: string; id: string }>
}) {
  const { consorcio: consorcioId, id: crudo } = await params
  const id = idONoEncontrado(crudo)
  const pantalla = await conConsorcio(consorcioId, 'Liquidación')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
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
        <Volver href={`/consorcios/${activo.id}/periodos`} />
        <h1>Liquidación {liquidacion.periodo}</h1>
        <p className="apagado">
          <EstadoDeLaLiquidacion estado={liquidacion.estado} /> · vence{' '}
          {fechaParaMostrar(liquidacion.vencimiento)}
        </p>

        {liquidacion.estado === 'anulada' && (
          <p className="aviso aviso--atencion" role="status">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              Esta liquidación fue anulada. Lo que se le emitió a los consorcistas no se reescribe:
              se reemplaza con una nueva, y las dos quedan registradas.
            </span>
          </p>
        )}

        <div className="tarjeta">
          <div className="resumen" role="list" aria-label="Totales de la liquidación">
            <div className="resumen__item" role="listitem">
              <span className="resumen__rotulo">Ordinario</span>
              <span className="resumen__valor cifra">
                {importeParaMostrar(liquidacion.totalOrdinario)}
              </span>
            </div>
            <div className="resumen__item" role="listitem">
              <span className="resumen__rotulo">Extraordinario</span>
              <span className="resumen__valor cifra">
                {importeParaMostrar(liquidacion.totalExtraordinario)}
              </span>
            </div>
            <div className="resumen__item" role="listitem">
              <span className="resumen__rotulo">Total</span>
              <span className="resumen__valor cifra">
                {importeParaMostrar(liquidacion.totalGeneral)}
              </span>
            </div>
          </div>
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
                  <td className="numero cifra">
                    {coeficienteParaMostrar(detalle.coeficienteAplicado)}
                  </td>
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
      </>
    )
  } catch (error) {
    if (!(error instanceof ErrorDeAplicacion)) throw error
    return (
      <p className="aviso aviso--problema" role="alert">
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }
}

/**
 * La base guarda `vigente`/`anulada` en minúsculas; en pantalla van con
 * mayúscula inicial y `.etiqueta` (guía §3.4). Solo presentación.
 */
const ETIQUETA_ESTADO_LIQUIDACION: Record<string, { texto: string; clase: string }> = {
  vigente: { texto: 'Vigente', clase: 'etiqueta--rendido' },
  anulada: { texto: 'Anulada', clase: 'etiqueta--vencido' },
}

function EstadoDeLaLiquidacion({ estado }: { estado: string }) {
  const etiqueta = ETIQUETA_ESTADO_LIQUIDACION[estado] ?? {
    texto: estado,
    clase: 'etiqueta--pendiente',
  }

  return <span className={`etiqueta ${etiqueta.clase}`}>{etiqueta.texto}</span>
}
