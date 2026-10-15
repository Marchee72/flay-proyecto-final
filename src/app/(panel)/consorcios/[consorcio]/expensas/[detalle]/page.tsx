import type { Metadata } from 'next'
import Link from 'next/link'
import { Download, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { fechaParaMostrar, importeParaMostrar } from '@/compartido/formato'
import { rolesEn } from '@/aplicacion/consorcios/mis-consorcios'
import { verConsorcio } from '@/aplicacion/consorcios/ver-consorcio'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verExpensa, type ExpensaVisible } from '@/aplicacion/liquidacion/ver-expensa'
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

    const propsExp: PropsExpensa = { base: activo.id, expensa, consorcio }

    return (
      <>
        <Volver href={`/consorcios/${activo.id}/expensas`} />
        <h1>
          Expensa {expensa.periodo} · unidad {expensa.designacion}
        </h1>
        <p className="apagado">Vence {fechaParaMostrar(expensa.vencimiento)}</p>

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
      <a className="boton boton--primario" href={direccion} download>
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

/** 2 · Una banda grafito con el total en blanco; las acciones en el cuerpo. */
function ExpensaTarjetaBanda({ base, expensa, consorcio }: PropsExpensa) {
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
        <div className="expensa-banda__acciones">
          <DescargaExpensa direccion={expensa.direccion} claseAviso="" />
          <PagoExpensa base={base} consorcio={consorcio} />
        </div>
        <VerGastos base={base} periodoId={expensa.periodoId} />
      </div>
    </div>
  )
}
