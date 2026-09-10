import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verGasto, type ComprobanteDelGasto } from '@/aplicacion/gastos/ver-gasto'
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
    gasto = await verGasto(ALMACEN, HABILITACIONES, RELOJ, {
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
        gasto.comprobantes.map((comprobante) => (
          <Comprobante key={comprobante.id} comprobante={comprobante} />
        ))
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

/**
 * Un comprobante. HEIC y TIFF **no los muestra ningun navegador**: para esos se
 * ofrece la descarga y se dice por que, en vez de un recuadro vacio (FR-018c).
 * Convertirlos a una vista previa queda para `004-servicios`.
 */
function Comprobante({ comprobante }: { comprobante: ComprobanteDelGasto }) {
  if (comprobante.estado !== 'disponible') {
    return (
      <p className="aviso aviso--atencion" role="status">
        La subida de este comprobante todavía no se confirmó. Se reintenta sola; si no aparece,
        volvé a subirlo.
      </p>
    )
  }

  const peso = `${comprobante.tipoContenido} · ${(comprobante.bytes / MB).toFixed(1)} MB`

  if (comprobante.soloDescarga) {
    return (
      <div className="tarjeta">
        <p>{peso}</p>
        <p className="ayuda">
          Los archivos {comprobante.tipoContenido === 'image/heic' ? 'HEIC' : 'TIFF'} no se ven
          dentro del navegador. Descargalo para abrirlo.
        </p>
        <a className="boton boton--fantasma" href={comprobante.direccion} download>
          Descargar comprobante
        </a>
      </div>
    )
  }

  return (
    <div className="tarjeta">
      <p>{peso}</p>
      {comprobante.tipoContenido === 'application/pdf' ? (
        <iframe className="visor" src={comprobante.direccion} title="Comprobante en PDF" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="visor" src={comprobante.direccion} alt="Comprobante digitalizado" />
      )}
      <p>
        <a href={comprobante.direccion} download>
          Descargar el original
        </a>
      </p>
    </div>
  )
}
