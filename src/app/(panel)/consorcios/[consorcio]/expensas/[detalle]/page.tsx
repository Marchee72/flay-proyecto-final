import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle, Clock, Download, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, importeParaMostrar } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { ALMACEN, HABILITACIONES, PROCESADOR_PAGOS, RELOJ } from '@/aplicacion/dependencias'
import { verExpensa, type ExpensaVisible } from '@/aplicacion/liquidacion/ver-expensa'
import { confirmarPagoEnLinea } from '@/aplicacion/pagos/confirmar-pago-en-linea'
import {
  consultarDisponibilidadPagoEnLinea,
  type DisponibilidadPagoEnLinea,
} from '@/aplicacion/pagos/iniciar-pago-en-linea'
import { MEDIOS_DE_PAGO } from '@/aplicacion/pagos/registrar'

import { BotonPagoEnLinea } from './boton-pago-en-linea'
import { ModalPago } from '../../pagos/modal-pago'

import { conConsorcio, idONoEncontrado } from '../../../../con-consorcio'
import { Volver } from '../../../../encabezado-consorcio'

export const metadata: Metadata = { title: 'Expensa — Flay' }

type ParametrosRetorno = {
  payment_id?: string
  collection_id?: string
  collection_status?: string
  status?: string
  intentoId?: string
}

/**
 * Una expensa por identificador directo (`CU-06`, SC-008, `RF-28`).
 *
 * Muestra el detalle de la expensa, estado del pago, boton de descarga de PDF,
 * registro manual de pago (para administradores) y pago en linea con Mercado Pago
 * si la expensa es la ultima vigente de la unidad y tiene saldo pendiente.
 */
export default async function ExpensaPage({
  params,
  searchParams,
}: {
  params: Promise<{ consorcio: string; detalle: string }>
  searchParams: Promise<ParametrosRetorno>
}) {
  const { consorcio: consorcioId, detalle: crudo } = await params
  const parametros = await searchParams
  const detalle = idONoEncontrado(crudo)
  const pantalla = await conConsorcio(consorcioId, 'Expensa')
  if ('salida' in pantalla) return pantalla.salida
  const { usuarioId, activo } = pantalla

  // Procesar confirmacion de retorno de Mercado Pago si el usuario vuelve de pagar
  const pagoExternoId = parametros.payment_id || parametros.collection_id
  let estadoRetorno: 'aprobado' | 'rechazado' | 'pendiente' | null = null
  let mensajeRetorno: string | null = null

  if (pagoExternoId) {
    try {
      const confirmacion = await confirmarPagoEnLinea(PROCESADOR_PAGOS, {
        consorcioId: activo.id,
        pagoExternoId: String(pagoExternoId),
        intentoId: parametros.intentoId ? String(parametros.intentoId) : undefined,
      })
      estadoRetorno = confirmacion.estado as 'aprobado' | 'rechazado' | 'pendiente'
      mensajeRetorno = confirmacion.mensaje || null
    } catch {
      if (parametros.collection_status === 'approved' || parametros.status === 'approved') {
        estadoRetorno = 'aprobado'
      } else if (parametros.collection_status === 'rejected' || parametros.status === 'rejected') {
        estadoRetorno = 'rechazado'
      }
    }
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

    const disponibilidadPago = await consultarDisponibilidadPagoEnLinea(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      detalleLiquidacionId: detalle,
    })

    const propsExp: PropsExpensa = {
      base: activo.id,
      expensa,
      consorcio,
      disponibilidadPago,
    }

    return (
      <>
        <Volver href={`/consorcios/${activo.id}/expensas`} />
        <h1>
          Expensa {expensa.periodo} · unidad {expensa.designacion}
        </h1>
        <p className="apagado">Vence {fechaParaMostrar(expensa.vencimiento)}</p>

        {estadoRetorno === 'aprobado' && (
          <p className="aviso aviso--exito" role="status">
            <CheckCircle className="icono" aria-hidden="true" />
            <span>{mensajeRetorno ?? 'El pago fue acreditado e imputado correctamente.'}</span>
          </p>
        )}
        {estadoRetorno === 'rechazado' && (
          <p className="aviso aviso--problema" role="alert">
            <TriangleAlert className="icono" aria-hidden="true" />
            <span>
              {mensajeRetorno ?? 'El pago fue rechazado o cancelado en la pasarela de pagos.'}
            </span>
          </p>
        )}
        {estadoRetorno === 'pendiente' && (
          <p className="aviso aviso--atencion" role="status">
            <Clock className="icono" aria-hidden="true" />
            <span>
              {mensajeRetorno ?? 'El pago se encuentra pendiente de acreditación en la pasarela.'}
            </span>
          </p>
        )}

        <ExpensaTarjetaBanda {...propsExp} />
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

/* ---- Tarjeta de expensa: banda grafito con el total, luego las acciones ---- */

type Consorcio = { unidades: readonly { id: string; designacion: string }[] }

type PropsExpensa = {
  base: string
  expensa: ExpensaVisible
  consorcio: false | Consorcio
  disponibilidadPago: DisponibilidadPagoEnLinea
}

const ESTADO_EXPENSA: Record<string, { texto: string; clase: string }> = {
  pagada: { texto: 'Pagada', clase: 'etiqueta--rendido' },
  vencida: { texto: 'Vencida', clase: 'etiqueta--vencido' },
  pendiente: { texto: 'Pendiente', clase: 'etiqueta--pendiente' },
}

function EstadoExpensa({ estado }: { estado: string }) {
  const e = ESTADO_EXPENSA[estado] ?? { texto: estado, clase: 'etiqueta--pendiente' }
  return <span className={`etiqueta ${e.clase}`}>{e.texto}</span>
}

function PagoExpensa({ base, consorcio }: { base: string; consorcio: false | Consorcio }) {
  if (!consorcio) return null
  return (
    <span className="exp-pago">
      <ModalPago
        consorcioId={base}
        unidades={consorcio.unidades}
        medios={MEDIOS_DE_PAGO}
        hoy={RELOJ.hoy().toISOString().slice(0, 10)}
      />
    </span>
  )
}

function DescargaExpensa({
  direccion,
  claseAviso,
}: {
  direccion: string | null
  claseAviso: string
}) {
  if (direccion) {
    return (
      <a className="boton boton--fantasma" href={direccion} download>
        <Download className="icono" aria-hidden="true" />
        Descargar la expensa
      </a>
    )
  }
  return (
    <p className={`aviso aviso--atencion ${claseAviso}`} role="status">
      <TriangleAlert className="icono" aria-hidden="true" />
      <span>
        El documento todavía se está generando. La liquidación ya está emitida: volver en unos
        minutos.
      </span>
    </p>
  )
}

function VerGastos({ base, periodoId }: { base: string; periodoId: string }) {
  return (
    <Link className="enlace-seco" href={`${base}/gastos?periodo=${periodoId}`}>
      Ver los gastos del período
    </Link>
  )
}

/** Una banda grafito con el total en blanco; las acciones en el cuerpo. */
function ExpensaTarjetaBanda({ base, expensa, consorcio, disponibilidadPago }: PropsExpensa) {
  return (
    <div className="tarjeta expensa-banda">
      <div className="expensa-banda__cab">
        <span className="expensa-banda__rotulo">Total a pagar</span>
        <strong className="cifra expensa-banda__cifra">
          {importeParaMostrar(expensa.totalUnidad)}
        </strong>
      </div>
      <div className="expensa-banda__cuerpo">
        <EstadoExpensa estado={expensa.estadoPago} />

        {disponibilidadPago.pagable && disponibilidadPago.saldoExigible && (
          <div className="expensa-banda__pago-en-linea">
            <BotonPagoEnLinea
              consorcioId={base}
              detalleId={expensa.detalleId}
              saldoExigible={disponibilidadPago.saldoExigible}
            />
          </div>
        )}

        <div className="expensa-banda__acciones">
          <DescargaExpensa direccion={expensa.direccion} claseAviso="" />
          <PagoExpensa base={base} consorcio={consorcio} />
        </div>
        <VerGastos base={base} periodoId={expensa.periodoId} />
      </div>
    </div>
  )
}
