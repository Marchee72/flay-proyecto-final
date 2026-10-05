import type { Metadata } from 'next'
import Link from 'next/link'
import { TriangleAlert } from 'lucide-react'

import {
  coeficienteParaMostrar,
  conMayuscula,
  fechaParaMostrar,
  importeParaMostrar,
  plural,
} from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import {
  previsualizarLiquidacion,
  type VistaPreviaDeLiquidacion,
} from '@/aplicacion/liquidacion/liquidar'

import { BotonLiquidar } from '../acciones-de-estado'
import { BotonModal } from '../../../../modal'
import { AvisoDeError, conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

export const metadata: Metadata = { title: 'Liquidar período — Flay' }

/**
 * Revision antes de liquidar (`RF-07`, `CU-03`). No escribe nada: la
 * confirmacion manda el total que se vio y la emision lo vuelve a comprobar.
 *
 * Lo que se revisa son **los gastos**, y el boton esta al pie de esa lista
 * porque emitir es la consecuencia de que esa lista este bien. El reparto por
 * unidad es el resultado del calculo, no una decision: con 96 unidades empuja
 * el boton fuera de la pantalla, asi que se consulta en un dialogo.
 */
export default async function LiquidarPeriodoPage({
  params,
}: {
  params: Promise<{ consorcio: string; id: string }>
}) {
  const { consorcio: consorcioId, id: crudo } = await params
  const id = idONoEncontrado(crudo)
  const pantalla = await conConsorcio(consorcioId, 'Liquidar período')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  const volver = <Volver href={`/consorcios/${activo.id}/periodos`} />

  let previa
  try {
    previa = await previsualizarLiquidacion(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      periodoId: id,
    })
  } catch (error) {
    return (
      <>
        {volver}
        <h1>Liquidar período</h1>
        <AvisoDeError error={error} />
      </>
    )
  }

  return (
    <>
      {volver}
      <h1>Liquidar {previa.periodo}</h1>
      <p className="apagado">
        Revisá los gastos del período y confirmá. Nada se emite hasta entonces.
      </p>

      {previa.estado === 'abierto' && (
        <p className="aviso aviso--atencion" role="status">
          <TriangleAlert className="icono" aria-hidden="true" />
          <span>El período está abierto. Al confirmar se cierra y ya no admite más gastos.</span>
        </p>
      )}

      <div className="tarjeta">
        <div className="resumen" role="list" aria-label="Totales de la liquidación">
          <div className="resumen__item" role="listitem">
            <span className="resumen__rotulo">Ordinario</span>
            <span className="resumen__valor cifra">
              {importeParaMostrar(previa.totalOrdinario)}
            </span>
          </div>
          <div className="resumen__item" role="listitem">
            <span className="resumen__rotulo">Extraordinario</span>
            <span className="resumen__valor cifra">
              {importeParaMostrar(previa.totalExtraordinario)}
            </span>
          </div>
          <div className="resumen__item" role="listitem">
            <span className="resumen__rotulo">Total</span>
            <span className="resumen__valor cifra">{importeParaMostrar(previa.totalGeneral)}</span>
          </div>
          <div className="resumen__item" role="listitem">
            <span className="resumen__rotulo">Vencimiento</span>
            <span className="resumen__valor cifra">{fechaParaMostrar(previa.vencimiento)}</span>
          </div>
        </div>
      </div>

      <h2>Gastos</h2>
      {previa.gastos.length === 0 ? (
        <p className="apagado">El período no tiene gastos: se liquidaría en cero.</p>
      ) : (
        <div className="tabla-desplazable">
          <table>
            <caption className="ayuda">Gastos del período {previa.periodo}</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Rubro</th>
                <th scope="col">Proveedor</th>
                <th scope="col">Detalle</th>
                <th scope="col">Clasificación</th>
                <th scope="col" className="numero">
                  Importe
                </th>
              </tr>
            </thead>
            <tbody>
              {previa.gastos.map((gasto) => (
                <tr key={gasto.id}>
                  <td>{fechaParaMostrar(gasto.fecha)}</td>
                  <td>{gasto.rubro}</td>
                  <td>{gasto.proveedor ?? '—'}</td>
                  <td className="principal">
                    <Link href={`/consorcios/${activo.id}/gastos/${gasto.id}`}>
                      {gasto.descripcion || 'Ver detalle'}
                    </Link>
                  </td>
                  <td>{conMayuscula(gasto.clasificacion)}</td>
                  <td className="numero cifra">{importeParaMostrar(gasto.importe)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Total</td>
                <td className="numero cifra">{importeParaMostrar(previa.totalGeneral)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {/* El pie de los gastos generales es donde se decide: emitir es la
          consecuencia de que esta lista esté bien. El reparto por unidad es
          detalle y se consulta aparte, en el diálogo. */}
      <div className="fila-acciones">
        <BotonLiquidar consorcioId={activo.id} periodoId={id} totalRevisado={previa.totalGeneral} />
        {previa.estado === 'abierto' && (
          <Link
            className="boton boton--fantasma"
            href={`/consorcios/${activo.id}/gastos?periodo=${id}`}
          >
            Corregir gastos
          </Link>
        )}
        <BotonModal
          etiqueta={`Ver el reparto entre ${plural(previa.detalles.length, 'unidad', 'unidades')}`}
          titulo={`Reparto de ${previa.periodo} por unidad`}
          variante="boton--fantasma"
        >
          <RepartoPorUnidad detalles={previa.detalles} />
        </BotonModal>
      </div>
    </>
  )
}

/**
 * El reparto por unidad, dentro del diálogo. Se renderiza en el servidor y
 * viaja como hijo del modal: no hace falta que el cliente tenga los importes
 * para dibujarlos, y siguen cruzando como cadena (medida 3 de § 14.1).
 */
function RepartoPorUnidad({ detalles }: { detalles: VistaPreviaDeLiquidacion['detalles'] }) {
  return (
    <div className="tabla-desplazable" tabIndex={0} role="region" aria-label="Reparto por unidad">
      <table>
        <caption className="ayuda">
          Lo que se le va a emitir a cada unidad. El ajuste por redondeo va en su propia columna.
        </caption>
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
              Saldo a favor
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
          {detalles.map((detalle) => (
            <tr key={detalle.unidadId}>
              <td>{detalle.designacion}</td>
              <td className="numero cifra">
                {coeficienteParaMostrar(detalle.coeficienteAplicado)}
              </td>
              <td className="numero cifra">{importeParaMostrar(detalle.importeOrdinario)}</td>
              <td className="numero cifra">{importeParaMostrar(detalle.importeExtraordinario)}</td>
              <td className="numero cifra">{importeParaMostrar(detalle.deudaAnterior)}</td>
              <td className="numero cifra">{importeParaMostrar(detalle.interesMora)}</td>
              <td className="numero cifra">{importeParaMostrar(detalle.saldoAFavorAplicado)}</td>
              <td className="numero cifra">{importeParaMostrar(detalle.ajusteRedondeo)}</td>
              <td className="numero cifra">{importeParaMostrar(detalle.totalUnidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
