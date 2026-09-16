import type { Metadata } from 'next'
import { Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verExpensa } from '@/aplicacion/liquidacion/ver-expensa'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { ModalPago } from '../../pagos/modal-pago'

import { conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

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
}: {
  params: Promise<{ consorcio: string; detalle: string }>
}) {
  const { consorcio: consorcioId, detalle: crudo } = await params
  const detalle = idONoEncontrado(crudo)
  const pantalla = await conConsorcio(consorcioId, 'Expensa')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla
  try {
    const expensa = await verExpensa(ALMACEN, HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      detalleId: detalle,
    })
    const roles = await rolesEn(HABILITACIONES, RELOJ, usuarioId, activo.id)
    const consorcio =
      roles.includes('administrador') &&
      (await verConsorcio(HABILITACIONES, RELOJ, { usuarioId, consorcioId: activo.id }))

    return (
      <>
        <Volver href={`/consorcios/${activo.id}/expensas`} />
        <h1>
          Expensa {expensa.periodo} · unidad {expensa.designacion}
        </h1>
        <p className="apagado">Vence {expensa.vencimiento}</p>

        <div className="tarjeta">
          <p>
            Total a pagar{' '}
            <strong className="cifra">{importeParaMostrar(expensa.totalUnidad)}</strong>
          </p>

          {consorcio && (
            <div className="fila-acciones">
              <ModalPago
                consorcioId={activo.id}
                unidades={consorcio.unidades}
                medios={MEDIOS_DE_PAGO}
                hoy={RELOJ.hoy().toISOString().slice(0, 10)}
              />
            </div>
          )}

          {expensa.direccion ? (
            <p>
              <a className="boton boton--primario" href={expensa.direccion} download>
                Descargar la expensa
              </a>
            </p>
          ) : (
            <p className="aviso aviso--atencion" role="status">
              <TriangleAlert className="icono" aria-hidden="true" />
              <span>
                El documento todavía se está generando. La liquidación ya está emitida: volver en
                unos minutos.
              </span>
            </p>
          )}
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
