import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, Clock, LoaderCircle, ScanSearch, TriangleAlert } from 'lucide-react'

import { momentoParaMostrar } from '@/compartido/formato'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { listarExtracciones, type ExtraccionEnLista } from '@/aplicacion/gastos/extraccion'

import { AvisoDeError, conConsorcio } from '../../../../con-consorcio'
import { EnVivo } from '../../../../en-vivo'
import { Volver } from '../../../../encabezado-consorcio'
import { CargadorDeComprobante } from './cargador'

export const metadata: Metadata = { title: 'Carga asistida — Flay' }

/** Color + icono + palabra, nunca color solo (§3.2). */
function Estado({ e }: { e: ExtraccionEnLista }) {
  if (e.estado === 'propuesta')
    return (
      <span className="etiqueta etiqueta--rendido">
        <BadgeCheck className="icono" aria-hidden="true" />
        Para revisar
      </span>
    )
  if (e.estado === 'no_disponible')
    return (
      <span className="etiqueta etiqueta--propietario">
        <TriangleAlert className="icono" aria-hidden="true" />
        Para revisar (sin asistencia)
      </span>
    )
  if (e.proceso === 'agotado')
    return (
      <span className="etiqueta etiqueta--vencido">
        <TriangleAlert className="icono" aria-hidden="true" />
        No se pudo procesar
      </span>
    )
  if (e.proceso === 'en_cola')
    return (
      <span className="etiqueta etiqueta--pendiente">
        <Clock className="icono" aria-hidden="true" />
        En cola
      </span>
    )
  return (
    <span className="etiqueta etiqueta--pendiente etiqueta--en-curso">
      <LoaderCircle className="icono" aria-hidden="true" />
      Extrayendo…
    </span>
  )
}

/**
 * Carga asistida de comprobantes (`RF-06`, `CU-06`, RN-14): el comprobante
 * suelto sube directo al almacen, la extraccion corre en segundo plano y el
 * gasto **solo** nace cuando la administracion confirma la propuesta. La
 * persona se queda aca: la fila avanza sola y mientras tanto sube el siguiente.
 */
export default async function CargaAsistidaPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string }>
  searchParams: Promise<{ descartada?: string }>
}) {
  const parametros = await searchParams
  const { consorcio: consorcioId } = await params
  const pantalla = await conConsorcio(consorcioId, 'Carga asistida')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  try {
    const extracciones = await listarExtracciones(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
    })
    const enProceso = extracciones.filter((e) => e.estado === 'pendiente').length
    const paraRevisar = extracciones.length - enProceso
    return (
      <>
        {enProceso > 0 && <EnVivo />}
        <Volver href={`/consorcios/${activo.id}/gastos`} texto="Volver a gastos" />
        <h1>Carga asistida</h1>
        <p className="apagado">
          Subí el comprobante y el sistema propone proveedor, fecha, importe y rubro. El gasto se
          crea recién cuando lo revisás y confirmás.
        </p>
        {parametros.descartada && (
          <p className="aviso aviso--atencion" role="status">
            <BadgeCheck className="icono" aria-hidden="true" />
            <span>Extracción descartada. No se creó ningún gasto.</span>
          </p>
        )}
        <div className="tarjeta">
          <CargadorDeComprobante consorcioId={activo.id} />
        </div>

        <h2>Comprobantes cargados</h2>
        {enProceso > 0 && (
          <p className="aviso aviso--atencion" role="status">
            <LoaderCircle className="icono" aria-hidden="true" />
            <span>
              {enProceso === 1
                ? '1 comprobante en proceso'
                : `${enProceso} comprobantes en proceso`}
              {paraRevisar > 0 && ` · ${paraRevisar} para revisar`}. La lista se actualiza sola.
            </span>
          </p>
        )}
        {extracciones.length === 0 ? (
          <div className="vacio">
            <ScanSearch aria-hidden="true" />
            <p>No hay comprobantes en proceso ni esperando revisión.</p>
          </div>
        ) : (
          <div className="tabla-desplazable">
            <table>
              <thead>
                <tr>
                  <th scope="col">Cargado</th>
                  <th scope="col">Proveedor detectado</th>
                  <th scope="col">Importe</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {extracciones.map((e) => (
                  <tr key={e.id}>
                    <td>{momentoParaMostrar(e.creadoEn)}</td>
                    <td>{e.proveedor ?? '—'}</td>
                    <td className="numero">{e.importe ?? '—'}</td>
                    <td>
                      <Estado e={e} />
                    </td>
                    <td>
                      {e.estado !== 'pendiente' ? (
                        <Link
                          className="boton boton--primario"
                          href={`/consorcios/${activo.id}/gastos/asistida/${e.id}`}
                        >
                          Revisar
                        </Link>
                      ) : e.proceso === 'agotado' ? (
                        <Link href="/bandeja">Reintentar desde la bandeja</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  } catch (error) {
    return <AvisoDeError error={error} />
  }
}
