import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verGasto } from '@/aplicacion/gastos/ver-gasto'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { AdjuntarComprobante } from './adjuntar'

export const metadata: Metadata = { title: 'Gasto — Flay' }

const MB = 1_048_576

export default async function GastoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ consorcio?: string; nuevo?: string }>
}) {
  const usuarioId = await usuarioDeLaSesion()
  if (!usuarioId) redirect('/ingresar')

  const { id } = await params
  const parametros = await searchParams
  const consorcios = await misConsorcios(HABILITACIONES, RELOJ, usuarioId)
  const activo = consorcios.find((c) => c.id === parametros.consorcio) ?? consorcios[0]

  if (!activo) redirect('/consorcios')

  let gasto
  try {
    gasto = await verGasto(HABILITACIONES, RELOJ, {
      usuarioId,
      consorcioId: activo.id,
      gastoId: id,
    })
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
      <h1>Gasto de {gasto.rubro}</h1>
      <p className="apagado">
        {gasto.periodo} · {gasto.clasificacion} · {gasto.proveedor ?? 'sin proveedor'}
      </p>

      {parametros.nuevo && (
        <p className="aviso aviso--atencion" role="status">
          Gasto registrado. Si tenés el comprobante, adjuntalo acá abajo.
        </p>
      )}

      <div className="tarjeta">
        <p>
          Importe <strong className="cifra">{gasto.importe}</strong>
        </p>
        <p className="apagado">
          Fecha {gasto.fecha}
          {gasto.descripcion ? ` · ${gasto.descripcion}` : ''}
        </p>
      </div>

      <h2>Comprobantes</h2>

      {gasto.comprobantes.length === 0 ? (
        <p className="vacio">Todavía no hay comprobantes adjuntos.</p>
      ) : (
        <ul>
          {gasto.comprobantes.map((comprobante) => (
            <li key={comprobante.id}>
              {comprobante.tipoContenido} · {(comprobante.bytes / MB).toFixed(1)} MB ·{' '}
              {comprobante.estado}
              {comprobante.soloDescarga && (
                <span className="ayuda">
                  {' '}
                  — este formato no se muestra en el navegador; se descarga.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {gasto.periodoAbierto && (
        <div className="tarjeta">
          <AdjuntarComprobante consorcioId={activo.id} gastoId={gasto.id} />
        </div>
      )}

      <p>
        <Link href={`/gastos?consorcio=${activo.id}`}>Volver a gastos</Link>
      </p>
    </>
  )
}
