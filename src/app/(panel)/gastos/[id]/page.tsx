import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { Building2, FileText, Siren, TriangleAlert } from 'lucide-react'

import { ErrorDeAplicacion } from '@/compartido/errores'
import { importeParaMostrar } from '@/compartido/formato'
import { misConsorcios } from '@/aplicacion/consorcios/mis-consorcios'
import { ALMACEN, HABILITACIONES, RELOJ } from '@/aplicacion/dependencias'
import { verGasto, type ComprobanteDelGasto } from '@/aplicacion/gastos/ver-gasto'
import { usuarioDeLaSesion } from '@/aplicacion/identidad/sesion'

import { AdjuntarComprobante } from './adjuntar'
import { EncabezadoDeConsorcio } from '../../encabezado-consorcio'
import { AvisoConsorcioNoElegido } from '../../selector-consorcio'
import { NOMBRE_GALLETA_CONSORCIO, resolverConsorcioActivo } from '../../consorcio-activo'

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

  if (consorcios.length === 0) {
    return (
      <>
        <h1>Gasto</h1>
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
        <h1>Gasto</h1>
        <AvisoConsorcioNoElegido
          consorcios={consorcios}
          base={`/gastos/${id}`}
          parametros={parametros}
          pedidoDesconocido={pedidoDesconocido}
        />
      </>
    )
  }

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
        <Siren className="icono" aria-hidden="true" />
        <span>{error.mensajeParaUsuario}</span>
      </p>
    )
  }

  return (
    <>
      <EncabezadoDeConsorcio
        nombre={activo.nombre}
        volverHref={`/gastos?consorcio=${activo.id}`}
        volverTexto="Volver a gastos"
      />
      <h1>Gasto de {gasto.rubro}</h1>
      <p className="apagado">
        {gasto.periodo} · {conMayuscula(gasto.clasificacion)} · {gasto.proveedor ?? 'sin proveedor'}
      </p>

      {parametros.nuevo && (
        <p className="aviso aviso--atencion" role="status">
          <TriangleAlert className="icono" aria-hidden="true" />
          <span>Gasto registrado. Si hay comprobante, adjuntarlo a continuación.</span>
        </p>
      )}

      <div className="tarjeta">
        <p>
          Importe <strong className="cifra">{importeParaMostrar(gasto.importe)}</strong>
        </p>
        <p className="apagado">
          Fecha {formatearFecha(gasto.fecha)}
          {gasto.descripcion ? ` · ${gasto.descripcion}` : ''}
        </p>
      </div>

      <h2>Comprobantes</h2>

      {gasto.comprobantes.length === 0 ? (
        <div className="vacio">
          <FileText aria-hidden="true" />
          <p>Todavía no hay comprobantes adjuntos.</p>
        </div>
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
    </>
  )
}

/**
 * `2026-09-05` → `05/09/2026`: solo reordena la cadena (§4, presentación).
 * La fecha no es dinero: se muestra sin `.cifra`.
 */
function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${anio}`
}

/** La base guarda `ordinario`/`extraordinario` en minúsculas; en pantalla va
 *  con mayúscula inicial. Solo presentación. */
function conMayuscula(valor: string): string {
  return valor.charAt(0).toUpperCase() + valor.slice(1)
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
        <TriangleAlert className="icono" aria-hidden="true" />
        <span>
          La subida de este comprobante todavía no se confirmó. Se reintenta sola; si no aparece,
          volver a subirlo.
        </span>
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
