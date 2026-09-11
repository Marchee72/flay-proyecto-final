import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios, rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'
import { verExpensa } from '@/aplicacion/liquidacion/ver-expensa'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { ModalPago } from '../../pagos/modal-pago'

import { AvisoConsorcioNoElegido } from '../../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../../consorcio-activo'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'

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

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Expensa</h1>
        <div className="vacio">
          <Building2 aria-hidden="true" />
          <p>
            Todavía no hay ningún consorcio al alcance. El paso siguiente es pedir acceso a la
            administración.
          </p>
        </div>
      </>
    )
  }

  const galletas = await cookies()
  const { activo, pedidoDesconocido } = resolverConsorcioActivo(
    parametros,
    consorcios,
    galletas.get(NOMBRE_GALLETA_CONSORCIO)?.value,
  )

  if (!activo) {
    return (
      <>
        <h1>Expensa</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base={`/expensas/${detalle}`}
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

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
        <EncabezadoDeConsorcio
          nombre={activo.nombre}
          volverHref={`/expensas?consorcio=${activo.id}`}
          volverTexto="Volver a expensas"
        />
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
            <p>
              <ModalPago
                consorcioId={activo.id}
                unidades={consorcio.unidades}
                medios={MEDIOS_DE_PAGO}
                hoy={RELOJ.hoy().toISOString().slice(0, 10)}
              />
            </p>
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
